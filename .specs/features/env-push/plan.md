# env-push: `.env` gerado na máquina e enviado por um comando; runbook enxuto

## Problem

Montar o `.env` de um ambiente hoje exige, na VPS, virar `deploy`, baixar o example com `curl`,
gerar três segredos com `openssl` em outro terminal e colar tudo no `nano`, com 14 variáveis. Um
erro (senha com caractere que quebra a URL do banco, `APP_URL` sem `https://`, placeholder
esquecido) só aparece quando o `server` não sobe no deploy. Trocar um valor depois repete o
caminho, e a única cópia dos segredos é a da VPS.

O runbook (`docs/runbooks/deploy.md`, 593 linhas) explica mais do que manda fazer: os comandos
se perdem no meio da prosa. A análise de 2026-09-24 achou nele três passos que podem trancar
quem segue (teste do `ops` que passa por senha, `99-hardening.conf` que perde para o
`50-cloud-init.conf`, ruleset que bloqueia o push direto em `main`) e dois que confundem
(`ps` sem `-a`, seção que termina como `deploy` e segue como `ops`). O usuário pediu: mais
simples, sem comentário desnecessário, com ênfase nos comandos que precisam rodar.

Quando isso entra, o `.env` de um ambiente sai de um comando na máquina de quem opera, é
validado antes de sair dela e chega à VPS pela chave do deploy que já existe; o runbook passa a
ser uma sequência de comandos com o mínimo de texto.

## Flow

Reusa a chave do deploy e a host key fixada que o GitHub já usa (AD-011), o
`.env.prod.example` como lista das variáveis obrigatórias e o `.gitignore` que já ignora
`.env.*`.

1. operador roda `scripts/env-push.sh staging [--apply]` -> `scripts/env-push.sh` (door 2)
2. sem `.env.staging` local: pergunta domínio, chave do Resend, remetente e as duas chaves do
   Turnstile, gera as três senhas e grava `.env.staging` com modo 600 (door 1)
3. valida o arquivo contra o `.env.prod.example` (exists) e as regras de formato; falha aqui = nenhuma
   conexão
4. `ssh` (chave `~/.ssh/bens-deploy-staging`, host key de `~/.ssh/bens-known_hosts-staging`)
   lê o `.env` remoto e o volume do Postgres; recusa se as credenciais do banco mudariam
5. `ssh` envia o arquivo pelo stdin; a VPS grava `.env.push`, confere o sha256 e troca para
   `.env` (modo 600) só se bater
6. `--apply` com `deploy.env` presente: `docker compose … up -d --wait --no-build` na VPS
7. `docs/runbooks/deploy.md` (exists) - a seção `.env` vira esse comando; o texto encolhe

## Impact

| Front | What changes |
| --- | --- |
| domain | termo novo: `.env.<ambiente>` - a cópia local do `.env` de um ambiente, na raiz do repositório, ignorada pelo git |
| decisões | AD-011 dizia "os segredos da aplicação ficam só no `.env` da VPS": passam a existir também na máquina de quem opera (nunca no GitHub). Registrado como AD-012, que complementa a AD-011 |
| runbook | a ordem das seções muda: `Chave SSH do deploy` passa a vir antes de `.env` (o comando precisa da chave). O `runbook` do `scripts/staging-smoke.mjs` (C34 do `cd-vps`) tem a lista de ordem atualizada no mesmo commit; as outras asserções dele continuam como estão |
| runbook | o `known_hosts` do ambiente passa a ser salvo em `~/.ssh/bens-known_hosts-<ambiente>`, e não mais na pasta corrente |
| stored data | nada: o `.env` de uma VPS que já existe continua valendo; o comando recusa trocar as credenciais do banco |

## Relations

None - no stored-data shape change

## Surface

None - nothing consumed outside by code: the command's interface (arguments, env, exit `0`/`1`) is door 2

## Landing

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| 1. arquivo local por ambiente | `.env.staging` e `.env.production` na raiz, modo 600, ignorados pelo `.env.*` que já está no `.gitignore` | pasta `deploy/<ambiente>.env`: pede regra nova no `.gitignore`, e um erro nela põe segredo no git |
| 2. interface do comando | `scripts/env-push.sh <ambiente> [--apply]`, ambiente `staging` ou `production`, em bash como o `deploy-remote.sh`; padrões `SSH_USER=deploy`, `SSH_KEY=~/.ssh/bens-deploy-<env>`, `SSH_KNOWN_HOSTS_FILE=~/.ssh/bens-known_hosts-<env>`, `DEPLOY_PATH=/opt/bens-seguros`, `SSH_HOST` = primeiro campo do known_hosts | script Node: o repositório já tem `.mjs`, mas prompt com eco desligado e `ssh` com stdin são uma linha em bash e várias em Node; e o runbook já pede `ssh` na máquina, não `pnpm install` |
| 3. segredos fora da VPS | AD-012: a cópia local em `.env.<ambiente>` é permitida; GitHub continua sem segredo da aplicação | `.env` inteiro num secret do environment, escrito a cada deploy: contraria a AD-011 e põe todos os segredos num lugar que qualquer workflow do repositório pode ler |

- Nothing else in this change is hard to reverse

## Criteria

### S1: gerar o `.env` do ambiente (P1)

Sem arquivo local, o comando pergunta só o que não dá para gerar e grava um `.env` completo.

**Acceptance Criteria**

1. WHEN `scripts/env-push.sh staging` runs without `.env.staging` THEN the script SHALL read, in this order, the domain, the Resend API key, the sender address, the Turnstile site key and the Turnstile secret key, and write `.env.staging` with mode `600` holding every key of `.env.prod.example`
2. WHEN it generates the file THEN `POSTGRES_PASSWORD` and `APP_DB_PASSWORD` SHALL be two different strings of 48 lowercase hex characters and `BETTER_AUTH_SECRET` a base64 string of 44 characters
3. WHEN it generates the file THEN it SHALL write `SITE_ADDRESS=<domínio>`, `APP_URL=https://<domínio>`, `SMTP_URL=smtps://resend:<chave>@smtp.resend.com:465`, `EMAIL_FROM="Bens Seguros <<remetente>>"`, `HTTP_PORT=80`, `HTTPS_PORT=443`, `POSTGRES_USER=bens`, `POSTGRES_DB=bens`, `SIGNUP_MODE=self_serve` and `LOG_LEVEL=info`
4. WHEN `.env.staging` already exists THEN the script SHALL read nothing from stdin and leave the file byte-identical
5. IF the environment argument is missing or not `staging`/`production`, or an unknown flag is given THEN the script SHALL exit `1` with a line starting `env-push: uso:`, write no file and make no `ssh` call

**Independent test:** apagar `.env.staging`, rodar com as respostas no stdin, ler o arquivo.

### S2: nada sai da máquina sem passar na validação (P1)

**Acceptance Criteria**

6. IF a key of `.env.prod.example` is absent or empty in the local file THEN the script SHALL exit `1` naming that key and make no `ssh` call
7. IF `APP_URL` is not `https://` followed by `SITE_ADDRESS` THEN the script SHALL exit `1` naming `APP_URL` and make no `ssh` call
8. IF `BETTER_AUTH_SECRET` has fewer than 32 characters THEN the script SHALL exit `1` naming it and make no `ssh` call
9. IF `POSTGRES_PASSWORD` or `APP_DB_PASSWORD` has a character outside `A-Za-z0-9._~-` THEN the script SHALL exit `1` naming the key and make no `ssh` call
10. IF a value still holds a placeholder of the example (`<RESEND_API_KEY>` or `example.com`) THEN the script SHALL exit `1` naming the key and make no `ssh` call
11. IF the key file or the known_hosts file does not exist THEN the script SHALL exit `1` naming the missing path and make no `ssh` call

**Independent test:** estragar uma variável por vez e ver o `ssh` stub sem chamadas.

### S3: enviar com segurança (P1)

**Acceptance Criteria**

12. WHEN the local file passes validation THEN the remote `DEPLOY_PATH/.env` SHALL be byte-identical to it, with mode `600`, and the script SHALL exit `0`
13. The script SHALL give every `ssh` call `-i <SSH_KEY>`, `IdentitiesOnly=yes`, `BatchMode=yes`, `StrictHostKeyChecking=yes` and `UserKnownHostsFile=<SSH_KNOWN_HOSTS_FILE>`, and SHALL target `deploy@<first field of the known_hosts>` unless `SSH_USER`/`SSH_HOST` are set
14. The file SHALL reach the VPS only on stdin: no argument of any `ssh` call contains the value of `POSTGRES_PASSWORD`, `APP_DB_PASSWORD`, `BETTER_AUTH_SECRET`, `SMTP_URL` or `TURNSTILE_SECRET_KEY`
15. IF the bytes the VPS receives differ from the local file THEN the remote `.env` SHALL stay byte-identical to before, no `.env.push` SHALL remain, and the script SHALL exit `1`
16. IF the remote `.env` exists and `POSTGRES_USER`, `POSTGRES_DB`, `POSTGRES_PASSWORD` or `APP_DB_PASSWORD` differ from the local file THEN the script SHALL exit `1` naming the key, not its value, and leave the remote `.env` byte-identical
17. IF the remote `.env` does not exist and the volume `bens-seguros-prod_postgres-data` exists THEN the script SHALL exit `1` saying the database already exists, and write no remote `.env`
18. WHEN the remote `.env` exists with the same four database values and another key differs THEN the script SHALL replace it (exit `0`)
19. The script SHALL print no output line containing the value of `POSTGRES_PASSWORD`, `APP_DB_PASSWORD`, `BETTER_AUTH_SECRET`, `SMTP_URL` or `TURNSTILE_SECRET_KEY`

**Independent test:** `ssh` stub que roda o comando remoto numa pasta temporária; comparar o `.env` de lá.

### S4: aplicar na hora (P2)

**Acceptance Criteria**

20. WHERE `--apply` is given and the remote `deploy.env` exists, WHEN the file was sent THEN the script SHALL run `docker compose -f docker-compose.prod.yml --env-file .env --env-file deploy.env up -d --wait --no-build` in `DEPLOY_PATH`
21. WHERE `--apply` is given and the remote `deploy.env` does not exist THEN the script SHALL send the file, run no `docker compose`, print that the first deploy applies it, and exit `0`
22. WHILE `--apply` is absent the script SHALL run no `docker compose`
23. IF the remote `docker compose up` exits non-zero THEN the script SHALL exit `1` with a line saying the new `.env` is already on the VPS

**Independent test:** `docker` stub no PATH remoto registra os argumentos.

### S5: runbook enxuto e corrigido (P1)

**Acceptance Criteria**

24. The section `.env` of `docs/runbooks/deploy.md` SHALL run `scripts/env-push.sh staging` and contain none of `nano`, `curl`, `sudo -iu deploy`
25. The runbook's `##` sections SHALL keep the 16 of `cd-vps` C34, with `Chave SSH do deploy` before `.env`
26. The `ops` access test SHALL pass `-o PasswordAuthentication=no`
27. The hardening file SHALL be `/etc/ssh/sshd_config.d/01-hardening.conf`, followed by a `sshd -T` command filtering `passwordauthentication`
28. The runbook SHALL pass `-a` to every `ps` of the compose
29. The ruleset item SHALL say that requiring the `ci` check forces changes to reach `main` by pull request
30. The `Problemas comuns` table SHALL have a row saying that when the new `server` does not get healthy the site is down and the fix is the rollback
31. The runbook `docs/runbooks/deploy.md` SHALL have at most 450 lines
32. The `ssh-keyscan` of the runbook SHALL write to `~/.ssh/bens-known_hosts-staging`

**Independent test:** ler o runbook; `node scripts/staging-smoke.mjs runbook`.

## Out of scope

| Excluded | Why |
| --- | --- |
| trocar `APP_DB_PASSWORD` pelo comando | a troca pede rodar o script do role no Postgres; continua o procedimento do runbook, que agora também manda atualizar o `.env.<ambiente>` local |
| bootstrap da VPS (hardening, Docker, usuário) por script | escopo escolhido pelo usuário: gerar + validar + enviar |
| baixar o `.env` da VPS para a máquina | nenhum pedido; quem já tem VPS copia o `.env` uma vez à mão (documentado) |

## Assumptions

| Assumption | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| profile | `standard` | igual ao `cd-vps`; a trava das credenciais do banco precisa de mutante morto, e o `light` não injeta falha | n |
| remetente na geração | pergunta o endereço, sugerindo `nao-responda@<domínio sem o primeiro rótulo>` | o domínio verificado no Resend costuma ser o raiz, não o `staging.` | n |
| o que o runbook corta | prosa que repete o que o comando já diz, explicações de por quê fora de avisos que evitam trancar a VPS, a seção de e2e contra o staging reduzida a uma linha | pedido do usuário: ênfase nos comandos | y |

**Open questions:** none - all resolved or logged above.

## Observable

| Surface | Decision | Landing |
| --- | --- | --- |
| command `env-push.sh` | output format | linhas `env-push: …` como `deploy: …` do script remoto; AC 5, 6 |
| command `env-push.sh` | every flag and default | AC 5, 13, 20-22 |
| command `env-push.sh` | exit codes | AC 5-12, 15-18, 23 |
| command `env-push.sh` | failure halfway | AC 15 (envio truncado), AC 23 (o `up` falha depois do envio) |
| document `deploy.md` | structure | AC 25 |
| document `deploy.md` | depth and tone | AC 31; comandos com `Onde` em uma linha |
| document `deploy.md` | what the reader does next | existing - cada seção termina no comando de verificação |

## Sources

- Pedido do usuário (2026-09-24): "gerar + validar + enviar"; "deixa ele mais simples, removendo comentário desnecessário e dando mais ênfase aos comandos realmente necessários"
- Análise do runbook nesta sessão: itens 1-6
- AD-011 (`.specs/STATE.md`)
