# ADR-003 — Better Auth para identidade e sessão; organizações em código próprio

**Status:** aceito, revisado por ADR-014, ADR-016 e ADR-017 (2026-09-23) · **Data:** 2026-09-21

## Revisão (pivot para o MVP, 2026-09-23)
- Continua valendo: Better Auth só para identidade e sessão, organizações em código próprio, cookie host-only, sessão em banco.
- "OWNER único" → "≥ 1 ADMIN ativo" (ADR-016). "Quota de usuários do plano" → `Organization.maxUsers` (ADR-017).
- O token de visitante do Web Chat está no ADR-014 (link público `/c/:slug`, não mais widget por canal).

## Context
O legado usa Better Auth com o plugin `organization`, mas reimplementa membros e convites com CASL e rotas próprias, o que duplica a lógica. O web fica na Vercel com cookies cross-subdomain, e o socket usa um JWT separado.

## Decision
- **Better Auth** montado no Fastify em `/api/auth/*` cuida **apenas** de identidade e sessão:
  - e-mail e senha, verificação, reset;
  - plugin `twoFactor`;
  - rate limit com `storage: "database"`.
- **Sem o plugin `organization`.** `Organization`, `Member` e `Invitation` são tabelas e rotas do módulo `organizations`. Ali ficam as regras:
  - OWNER único;
  - quota de usuários do plano;
  - auditoria de mudança de role;
  - transferência de carteira.
- **Organização ativa:** `Session.activeOrganizationId` (`additionalFields`). Muda via `POST /api/v1/me/active-organization`, que valida a membership. O tenant nunca vem do cliente.
- **Cookie** httpOnly, Secure, `SameSite=Lax`, host-only. Web e API ficam na mesma origem (ADR-008).
- O **Socket.IO** autentica com o mesmo cookie. O widget usa um token de visitante curto, escopado ao canal.
- A sessão dura 3 dias e rotaciona a cada 12h. `cookieCache` desligado.

## Why
- O Better Auth resolve bem o que é genérico: senha, sessão, verificação e 2FA.
- Membros e convites são poucos endpoints, mas concentram regras de negócio (billing, carteira, auditoria). Nos hooks de um plugin, essas regras ficariam espalhadas; em código próprio, ficam explícitas e testáveis.
- A sessão em banco permite revogar imediatamente.

## Alternatives considered
- **Plugin `organization` de ponta a ponta:** menos código inicial, mas regras de negócio em hooks de biblioteca.
- **Híbrido, como no legado:** é a duplicação que motivou esta decisão.
- **Auth própria:** reescreveria o que já funciona.
- **JWT stateless:** revogação difícil.

## Trade-offs
- Mais ~5 endpoints próprios (convites, membros, troca de org).
- Uma query de sessão por request, sem cache. Desprezível na escala atual.

## Consequences
O web usa `better-auth/react` apenas nas telas de login, cadastro e reset. O resto vem de `GET /api/v1/me`.
