Fechar a F3 do roadmap: fluxo e2e completo no staging.

## Onde estamos (2026-09-26)

- F0–F3 entregues. Fatias da F3 com `verification.md` PASS: `public-chat-api`, `visitor-realtime`, `web-chat-ui`, `inbox` (`.specs/features/<x>/`). O critério da F3 que falta, em `docs/roadmap.md`: "fluxo e2e verde no staging".
- `main` em `ce00a25`, CI verde (run `36250587672`: ci + e2e, 104 passed) e deploy no staging verde (run `36251067456`).
- Staging: `https://staging.bens360.com.br` (health 200). O domínio antigo `staging.bensseg.com` não responde mais (feature `domain-bens360`), mas `docs/roadmap.md` (marco Staging) e `.specs/STATE.md` ainda o citam: corrija o texto, preservando o histórico como histórico.
- Regra fullstack (AD-019, cabeçalho do roadmap): vale a partir de agora para toda feature com tela.

## O que provar no staging

1. Visitante abre `/c/:key` da org de teste, informa telefone, aceita o aviso, passa o Turnstile e envia a primeira mensagem.
2. Um COMMERCIAL vê a conversa na Fila do `/inbox`, assume, responde, e o visitante vê a resposta em < 2 s.
3. O visitante responde e o COMMERCIAL vê a mensagem sem recarregar.
4. COMMERCIAL encerra a própria conversa; não consegue encerrar a de outro membro (404); MANAGER/ADMIN encerra qualquer uma.
5. O link da org A nunca cria dado na org B: duas orgs de teste; a conversa do link A não aparece no inbox de B.

## Restrições que você vai encontrar

- Staging usa Turnstile real e e-mail real (Resend). O `signUp` do e2e local (token dummy `XXXX.DUMMY.TOKEN.XXXX` + Mailpit) não funciona lá. Não desligue nem enfraqueça o Turnstile, e não mude o `.env` do staging sem me perguntar.
- `POST /api/public/chat/:key/sessions`: limite de 5/IP/min.
- Acesso à VPS e ao `gh`: ver "Acesso a infraestrutura" no `CLAUDE.md`. Nunca imprimir segredos do `.env.staging`.
- Dados de teste identificáveis como teste (nomes de org com "E2E", telefones fictícios); nada de PII real.

## Como

1. Declare o processo (`tlc-spec-lean`; provavelmente só `checks.md` com `## Intent`, feature `staging-e2e-f3`).
2. Antes de executar, me proponha, com recomendação, como obter as contas no staging sem burlar o Turnstile. Opções prováveis:
   - (a) eu crio a conta ADMIN no navegador, e você convida o COMMERCIAL e o MANAGER pelo painel (e-mails de convite reais que eu abro);
   - (b) Playwright com `storageState` de sessões que eu logo manualmente;
   - (c) outra opção que você encontrar no código ou em `docs/runbooks/`.

   Pergunte uma coisa por vez.
3. Execute com Playwright apontando para o staging (`E2E_BASE_URL` em `apps/web/playwright.config.ts`; o Turnstile do visitante roda no navegador) ou com agent-browser. Guarde a evidência em `.specs/features/staging-e2e-f3/`: screenshots, tempo medido da resposta, ids das conversas, sem PII.
4. Verifier independente no fim (sub-agente novo, como manda a skill).
5. Atualize `docs/roadmap.md` (F3 concluída, com data e evidência) e `.specs/STATE.md` ("Próximo: F4 IA").
6. Commits locais; push só com meu ok.

## Depois

A próxima fase é a F4 (IA). Pelo roadmap atualizado ela é fullstack: toggle `aiEnabled` e consumo na tela, mensagens da IA no inbox, e smoke Playwright na mesma feature. Não comece a F4 nesta sessão; ao terminar a F3, só me diga que está pronta para começar.
