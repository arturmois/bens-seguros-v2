# ADR-016 — Papéis, carteira e atribuição concorrente

**Status:** aceito · **Data:** 2026-09-23 · **Revisa** ADR-005 (papéis) e a parte de carteira do ADR-010

## Context
O v2 tem cinco papéis (`OWNER, ADMIN, MANAGER, COMMERCIAL, VIEWER`) com a invariante "OWNER único"
(índice parcial `Member_one_owner`) e a carteira por `salespersonId` (`scopeFor`, AD-009). O MVP
tem três papéis (handoff §7). Um lead novo cai numa fila: ADMIN/MANAGER atribuem, COMMERCIAL assume,
sem round-robin, e **dois comerciais nunca assumem o mesmo lead** (§8). COMMERCIAL encerra as
próprias conversas; MANAGER e ADMIN, qualquer uma (§21).

## Decision
- **Papéis: `ADMIN | MANAGER | COMMERCIAL`.** `OWNER` e `VIEWER` saem. O criador da organização é
  ADMIN.
- **Invariante: sempre ≥ 1 ADMIN ativo** (substitui "OWNER único"). Rebaixar, desativar ou remover o
  último ADMIN ativo → 422. Verificado no use case, dentro da transação, com lock das linhas de
  `Member` da organização.
- **RBAC continua um mapa estático** (`ROLE_PERMISSIONS`, ADR-005), com `requirePermission`
  obrigatório. Permissões novas nascem com a feature que as usa (ex.: `lead:assign`, `lead:claim`,
  `conversation:attend`, `conversation:close-any`, `conversation:return-to-ai`, `opportunity:write`,
  `channel:manage`, `org:branding`).
- **Carteira:**
  - o dono de contato e oportunidade é `ownerId`; o de conversa em atendimento humano, `assigneeId`;
  - **COMMERCIAL vê a própria carteira + a fila** (contatos sem dono e conversas em `QUEUE`), para
    poder assumir. A carteira de outro comercial → **404**;
  - MANAGER e ADMIN veem toda a organização;
  - `scopeFor(ctx)` passa a devolver o filtro por entidade (`ownerId = eu OR ownerId IS NULL` para
    COMMERCIAL); a AD-009 é revisada na primeira feature que tiver `ownerId` (F2/F5).
- **Atribuição concorrente por update condicional:**
  - lead: `UPDATE contact SET ownerId = $me WHERE id = $id AND ownerId IS NULL`;
  - conversa: `UPDATE conversation SET handler = 'HUMAN', assigneeId = $me WHERE id = $id AND handler
    IN ('AI', 'QUEUE')`;
  - 0 linhas → **409** (`ALREADY_ASSIGNED`). Quem assume a conversa de um contato sem dono vira o
    dono do contato, na mesma transação.
- **Encerramento:** COMMERCIAL só encerra conversa em que é `assigneeId`; MANAGER e ADMIN encerram
  qualquer uma (regra no use case + teste).

## Why
- Três papéis cobrem o produto; `VIEWER` não tem caso de uso e `OWNER` só duplicava `ADMIN`.
- "≥ 1 ADMIN" impede a organização órfã sem obrigar a eleger um dono único.
- Ver a fila é condição para "COMMERCIAL assume"; esconder a carteira alheia mantém o que o ADR-010
  já decidia.
- O update condicional é atômico no PostgreSQL sem lock explícito nem fila; o resultado (1 ou 0
  linhas) é a resposta.

## Alternatives considered
- **Manter OWNER:** um papel a mais sem regra própria no MVP.
- **COMMERCIAL só com a própria carteira (sem fila):** contradiz o §8.
- **COMMERCIAL vê tudo e edita só o seu:** rejeitado no ADR-010 (expõe a carteira alheia).
- **`SELECT … FOR UPDATE` + update:** mesmo efeito, duas queries.

## Trade-offs
- `OWNER` e `VIEWER` saem de um enum do PostgreSQL: a migration recria o tipo (sem dados em produção).
- O filtro de carteira deixa de ser uma igualdade simples; cada repository com carteira precisa do
  teste `withTwoSalespeople` incluindo o caso "sem dono".

## Consequences
- A F1 troca os papéis, a invariante, o snapshot da matriz e os textos da UI.
- A F5 prova a concorrência: N comerciais assumem o mesmo lead/conversa em paralelo → exatamente 1
  sucesso, os demais 409.
