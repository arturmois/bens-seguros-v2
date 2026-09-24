Vamos rodar o Checkpoint H3 (harness depois da poda do ERP) do Bens Seguros.

Antes de tudo, leia a seção "Checkpoint H3" de docs/roadmap.md (e, para comparar, o "Checkpoint H2" no apêndice), o CLAUDE.md e o `.specs/STATE.md`.
Contexto: o repositório pivotou de ERP para o MVP de leads + atendimento com IA + handoff + comercial (ADR-011 a ADR-017). O `CLAUDE.md`, o `docs/architecture.md`, o `docs/roadmap.md`, o `README.md` e o `STATE.md` foram reescritos; o `docs/migration.md` virou stub; os `prompts/prompt-0*.md` e `prompt-h2.md` foram arquivados. A F0 (`erp-prune`) está fechada com `verification.md` PASS (rodada 3, `e1f406c`).

Gate: não comece se `git status` não estiver limpo ou se `pnpm lint && pnpm typecheck && pnpm test && pnpm build` não passar (com `docker compose up -d`).

Processo: skill `harness-eval`, nesta sessão.
- Q1 (docs opcionais): incluir `docs/architecture.md` e `docs/roadmap.md`. ADRs, `.specs/`, `docs/handoff.md`, `docs/architecture-analysis.md` e o stub `docs/migration.md` ficam fora.
- Q2 (tracks): **`A only`**, como o roadmap pede. Se achar que o volume de reescrita justifica `C`, pergunte antes, com a estimativa de tokens.

O que observar no Track A:
- todo caminho, comando, helper e script citado no CLAUDE.md existe e bate com o código (`db.withTenant`, `withUser`, `withInvitation`, `withoutTenant`, `scopeFor`, `requirePermission`, `audit.record`, `infrastructure/queue.ts`, `shared/money.ts`, `shared/config.ts`, `withTwoTenants`, `withTwoSalespeople`, `pnpm api:generate`, os scripts da `tlc-spec-lean`), e os ADRs que ele cita (011–017) existem;
- o `docs/architecture.md` cita de propósito caminhos que ainda não existem, marcados **[Fx]** (ex.: `modules/contacts/`, `infrastructure/events.ts`, `src/whatsapp.ts`, `ai/provider.ts`). Um caminho [Fx] ausente **não** é BROKEN. BROKEN é: um caminho marcado **[existe]** que não existe; um caminho citado sem marcação que não existe; ou um [Fx] que já existe (a marcação ficou velha);
- nenhum doc vivo aponta para o que a F0 removeu (`storage.ts`, `pdf.ts`, MinIO, `S3_*`, `commissionSplitBp`, `migration.md` como fonte de regras);
- falsos positivos conhecidos do H2 (diretório checado como arquivo, exemplos genéricos da própria skill, caminho relativo a `apps/server`): classifique e siga.

Aviso de ambiente: neste shell o `rg` simples está quebrado (um hook o reescreve e ele sai 1 mesmo com ocorrência). Use `ARGV0=rg ~/.local/bin/claude <args>` e confira sempre com uma busca que sabidamente encontra algo antes de confiar num "não achou" (lição L-042).

Saída: o relatório da skill. **Não aplique nada antes da minha revisão.** Depois do meu ok, aplique as correções num commit `chore(harness): …` e registre o que foi mantido e por quê.

Critério de aceite: Track A sem BROKEN; cada achado corrigido ou registrado com justificativa; os quatro gates passando depois do commit. Anote o resultado na seção "Checkpoint H3" do roadmap e no `.specs/STATE.md`.
Blast radius: nada de `git push` nem de ação em VPS sem o meu ok explícito.
No final, resuma o que mudou no harness e o que fica como atenção para a F1 (papéis ADMIN/MANAGER/COMMERCIAL e "≥ 1 ADMIN", recriação do enum `Role`, canal Web Chat no onboarding, logo em `bytea`).
