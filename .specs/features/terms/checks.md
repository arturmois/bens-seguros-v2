# Terms checks

Profile: standard
Plan: `.specs/features/terms/plan.md`

16 checks in 3 slices · 3 one-way doors · 0 open

Proof command prefix for the server, omitted below: `pnpm --filter @bens/server exec vitest run`.

## Checks

### S1 - Aceite no server · ~8 files · ~40 KB · ~10k

**C1** - `GET /api/v1/me` de um usuário sem aceite responde `200` com `terms: { pending: true, termsVersion: '1.0', privacyVersion: '1.0' }` (AC 1)
Proof: `src/modules/auth/terms.spec.ts -t "reports pending terms before acceptance"`

**C2** - Depois de aceitar as duas versões correntes, `GET /api/v1/me` traz `terms.pending: false` (AC 2)
Proof: `src/modules/auth/terms.spec.ts -t "reports pending false after both current versions"`

**C3** - Um aceite só da versão `0.9` de um dos documentos deixa `terms.pending: true` com as versões correntes `1.0` (AC 3)
Proof: `src/modules/auth/terms.spec.ts -t "pending stays true when only an older version exists"`

**C4** - `POST /api/v1/me/terms-acceptance` com `{ termsVersion: '1.0', privacyVersion: '1.0' }` grava um `TermsAcceptance` `TERMS` e um `PRIVACY` com essas versões, `acceptedAt` do momento e `ipAddress` igual ao IP da request, e responde `200` com `termsVersion`, `privacyVersion` e `acceptedAt` (AC 4)
Proof: `src/modules/auth/terms.spec.ts -t "stores both documents with the client ip"`

**C5** - Aceitar de novo as mesmas versões responde `200` com o `acceptedAt` do primeiro aceite e a contagem de linhas do usuário continua `2` (AC 5)
Proof: `src/modules/auth/terms.spec.ts -t "repeat acceptance keeps the first timestamp"`

**C6** - Body com `termsVersion: '9.9'` ou `privacyVersion: '9.9'` responde `409` `{ error: { code: 'TERMS_VERSION_MISMATCH', message: 'Os termos foram atualizados. Recarregue a página para ver a versão atual.' } }` e não grava linha (AC 6)
Proof: `src/modules/auth/terms.spec.ts -t "rejects a version that is not current"`

**C7** - Body com campo extra e body sem `privacyVersion` respondem `400` com `error.code: 'VALIDATION_ERROR'` e não gravam linha (AC 7)
Proof: `src/modules/auth/terms.spec.ts -t "rejects a body that is not the two versions"`

**C8** - `POST /api/v1/me/terms-acceptance` sem sessão responde `401` com `error.code: 'UNAUTHENTICATED'` (AC 8)
Proof: `src/modules/auth/terms.spec.ts -t "requires a session"`

**C9** - O aceite do usuário A deixa `terms.pending: false` no `/me` de A e `terms.pending: true` no `/me` de B (AC 9)
Proof: `src/modules/auth/terms.spec.ts -t "one user acceptance does not clear another"`

**C10** - `GET /api/v1/me` sem sessão responde `401`; `POST /api/v1/me/terms-acceptance` sem header `Origin` responde `403` com `error.code: 'ORIGIN_NOT_ALLOWED'` (Surface)
Proof: `src/modules/auth/terms.spec.ts -t "requires a session"`
Proof: `src/modules/auth/terms.spec.ts -t "rejects a write from another origin"`

### S2 - Web · ~6 files · ~25 KB · ~6k

Proof prefix: `pnpm --filter @bens/web exec playwright test`.

**C11** - Com `terms.pending: true`, abrir `/dashboard` termina em `/terms-acceptance` com `redirect` contendo `/dashboard` (AC 10)
Proof: `e2e/terms.spec.ts -g "sends a pending user to terms acceptance"`

**C12** - "Li e aceito" envia as versões do `/me` e, com `redirect=/settings/security`, termina em `/settings/security`; sem `redirect`, termina em `/dashboard` (AC 11)
Proof: `e2e/terms.spec.ts -g "accepts and follows the redirect"`

**C13** - Aceite respondendo `409` mostra `Os termos foram atualizados. Recarregue a página para ver a versão atual.` e o próximo envio usa as versões novas do `/me` (AC 12)
Proof: `e2e/terms.spec.ts -g "reloads terms when the version changed"`

**C14** - `/terms-acceptance` tem links para `/terms` e `/privacy` com `target="_blank"` (AC 13)
Proof: `e2e/terms.spec.ts -g "links the two documents in a new tab"`

**C15** - `/terms` e `/privacy` sem sessão mostram a versão `1.0` e um trecho do texto de cada documento (AC 14)
Proof: `e2e/terms.spec.ts -g "shows the public documents"`

**C16** - Durante o envio, o botão mostra `Aguarde…` e fica desabilitado (Observable)
Proof: `e2e/terms.spec.ts -g "disables the button while accepting"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `GET /api/v1/me` statuses (2) | 200 C1 · 401 C10 | - |
| `POST /api/v1/me/terms-acceptance` statuses (5) | 200 C4 · 400 C7 · 401 C8 · 403 C10 · 409 C6 | - |
| documents (2) | TERMS C4 · PRIVACY C4 | - |
| pending causes (3) | none C1 · both current C2 · older version C3 | - |
| Landing doors (3) | record C4 · contract C6 · session stays open C1 | - |
| web screens (3) | `/terms-acceptance` C11 · `/terms` C15 · `/privacy` C15 | - |

- Claims naming a status code, route or response shape: C1, C4, C6, C7, C8, C10 - each has a proof that crosses the boundary
- No other check claims more than the single case its proof exercises

## Test policy

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| Decides, reached across a boundary | one at the boundary and one at its own layer | the contract at the boundary; one asserted case per row of the decision table at its own layer |
| Decides, not reached across a boundary | one at its own layer | one asserted case per row of the decision table |
| Entry point that decides nothing | one at the boundary | accepted input, each rejected input, each error path |
| Instrumentation, pass-throughs | none of its own | covered by its consumer's proof |

Evidence:

- pending: three inputs (no row, both current, older version) -> decides, reached at `GET /api/v1/me`
- accept: match / mismatch / repeat -> decides, reached at `POST /api/v1/me/terms-acceptance`
- `_app` guard: pending true redirects -> decides, reached in the browser
- closest analogue: `apps/server/src/modules/auth/me.spec.ts`, same session boundary

Cost: the boundary proofs cover every named row. The pending rule is asserted at `/me`, which is the only caller.

## Swept

- validation: C6, C7
- failure modes: C6, C13
- idempotency: C5
- authorization: C8, C9, C10
- concurrency: n/a - AC 5 cobre a repetição sequencial; uma corrida no único composto vira o `409 CONFLICT` genérico de `P2002`, fora do contrato desta feature
- data lifecycle: n/a - o aceite não expira; troca de versão é deploy das constantes
- dependency failure: n/a - sem serviço externo
- state transitions: C1, C2, C3
- observability: n/a - sem log novo exigido; o aceite não leva PII para log

## Handoff

- S1 = 10k, S2 = 6k, total 16k, under the 150k budget - one builder
