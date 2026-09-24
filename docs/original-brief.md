> **Arquivado em 2026-09-23 (ADR-011):** brief do rebuild do ERP, substituído por `docs/handoff.md` (requisitos do MVP). Não use como instrução.

# Rebuild do Bens Seguros — Arquitetura Simplificada

## Contexto

Quero reconstruir o projeto **Bens Seguros** do zero em um novo repositório.

O projeto atual está em:

https://github.com/arturmois/bens-seguros

O repositório atual deve ser tratado como **legacy/reference implementation**.

A nova implementação NÃO deve simplesmente copiar a arquitetura existente.

O objetivo é analisar o sistema atual, preservar seus requisitos e regras de negócio relevantes, mas reconstruí-lo com uma arquitetura significativamente mais simples, coesa e fácil de evoluir.

O projeto ainda está em desenvolvimento, portanto mudanças arquiteturais radicais são permitidas.

---

# Objetivo arquitetural

Construir um **modular monolith** simples.

A arquitetura inicial deve possuir apenas:

```text
apps/
├── server/
└── web/
```

Não criar múltiplos serviços, workers, packages ou abstrações distribuídas sem uma necessidade concreta.

A regra principal é:

> Complexity must be earned.

Não introduza complexidade antecipadamente apenas porque uma arquitetura é considerada "enterprise", "clean", "DDD" ou "scalable".

Queremos uma arquitetura que seja:

* simples;
* explícita;
* coesa;
* fácil de entender;
* fácil de testar;
* fácil de modificar;
* segura;
* observável;
* preparada para crescer;
* mas sem overengineering.

---

# Regra fundamental

O sistema legado é fonte de:

* requisitos;
* regras de negócio;
* fluxos;
* funcionalidades;
* integrações;
* comportamento existente.

O sistema legado NÃO é fonte obrigatória de:

* arquitetura;
* organização de pastas;
* abstrações;
* patterns;
* bibliotecas;
* divisão de serviços;
* boundaries;
* decisões técnicas.

Questione todas as decisões arquiteturais existentes.

Se uma abstração não possui uma justificativa concreta, elimine-a.

---

# FASE 1 — Análise do sistema legado

Antes de criar código, faça uma análise completa do repositório:

```text
https://github.com/arturmois/bens-seguros
```

Mapeie:

### Produto

* objetivo do sistema;
* usuários;
* principais jornadas;
* funcionalidades;
* regras de negócio;
* entidades;
* relacionamentos;
* permissões;
* multi-tenancy;
* integrações externas.

### Backend

Identifique:

* APIs;
* rotas;
* módulos;
* services;
* repositories;
* use cases;
* entidades;
* validações;
* middlewares;
* autenticação;
* autorização;
* jobs;
* filas;
* eventos;
* WebSockets;
* integrações.

### Frontend

Identifique:

* páginas;
* features;
* componentes;
* formulários;
* tabelas;
* dashboards;
* autenticação;
* gerenciamento de estado;
* comunicação com API.

### Infraestrutura

Identifique:

* PostgreSQL;
* MongoDB;
* Redis;
* BullMQ;
* Docker;
* storage;
* email;
* pagamentos;
* IA;
* WhatsApp;
* observabilidade;
* CI/CD.

---

# FASE 2 — Avaliação arquitetural

Faça uma análise crítica da arquitetura atual.

Para cada elemento importante, responda:

1. Por que ele existe?
2. Qual problema resolve?
3. Ainda precisamos dele?
4. Existe uma alternativa mais simples?
5. Podemos removê-lo?
6. Podemos incorporá-lo ao modular monolith?
7. A complexidade é justificada pelo estágio atual do produto?

Não preserve uma decisão apenas porque ela já existe.

Produza uma tabela:

| Componente atual | Problema que resolve | Necessário? | Decisão nova     | Justificativa |
| ---------------- | -------------------- | ----------: | ---------------- | ------------- |
| package X        | ...                  |         não | remover          | ...           |
| chat-server      | ...                  |      talvez | incorporar       | ...           |
| worker           | ...                  |      talvez | BullMQ no server | ...           |
| MongoDB          | ...                  |         não | PostgreSQL       | ...           |

---

# FASE 3 — Nova arquitetura

Projete uma arquitetura nova baseada nos seguintes princípios.

## Aplicações

Somente:

```text
apps/
├── server
└── web
```

### Server

Fastify + TypeScript.

Responsabilidades:

* HTTP API;
* autenticação;
* autorização;
* regras de negócio;
* persistência;
* integrações;
* jobs;
* realtime;
* observabilidade.

### Web

Next.js + React.

Responsabilidades:

* UI;
* navegação;
* formulários;
* gerenciamento de estado local;
* consumo da API.

---

# Modular Monolith

O backend deve ser organizado por domínio/feature:

```text
apps/server/src/
├── modules/
│   ├── auth/
│   ├── users/
│   ├── organizations/
│   ├── clients/
│   ├── insurers/
│   ├── leads/
│   ├── proposals/
│   ├── policies/
│   ├── claims/
│   ├── commissions/
│   ├── notifications/
│   ├── billing/
│   └── chat/
│
├── infrastructure/
│   ├── database/
│   ├── redis/
│   ├── storage/
│   ├── email/
│   └── integrations/
│
├── shared/
│   ├── config/
│   ├── errors/
│   ├── logger/
│   ├── security/
│   └── utils/
│
├── app.ts
└── server.ts
```

Essa estrutura é apenas uma referência.

Adapte-a ao domínio real encontrado no projeto.

---

# Regra para módulos

Não criar automaticamente uma Clean Architecture completa para cada módulo.

Evite estruturas como:

```text
domain/
application/
infrastructure/
ports/
adapters/
entities/
use-cases/
repositories/
factories/
dtos/
mappers/
```

quando elas não forem necessárias.

Prefira algo simples:

```text
modules/clients/
├── client.schema.ts
├── client.repository.ts
├── create-client.ts
├── list-clients.ts
├── update-client.ts
├── delete-client.ts
├── client.routes.ts
└── client.spec.ts
```

Se determinado domínio realmente possuir complexidade suficiente para justificar mais separação, introduza-a apenas nesse módulo.

**Complexidade deve ser localizada, não espalhada pela aplicação inteira.**

---

# Fluxo padrão

Preferir:

```text
HTTP Route
    ↓
Use Case
    ↓
Repository / Integration
    ↓
Database / External Service
```

Exemplo:

```text
POST /clients
       ↓
createClient()
       ↓
clientRepository.create()
       ↓
Prisma
```

Não criar abstrações intermediárias sem necessidade.

---

# Dependency Injection

Não utilizar DI container global por padrão.

Evitar:

```text
tsyringe
container.resolve(...)
decorators para tudo
```

Preferir composição explícita:

```text
server.ts
    ↓
dependencies
    ↓
routes
    ↓
use cases
```

Exemplo conceitual:

```ts
const clientRepository = new ClientRepository(prisma);

const createClient = new CreateClient(clientRepository);

registerClientRoutes(app, {
  createClient,
});
```

Se posteriormente surgir uma necessidade real de DI mais sofisticada, documente a decisão antes de introduzi-la.

---

# Database

Avalie criticamente o uso atual de:

```text
PostgreSQL
MongoDB
Redis
```

A preferência inicial é:

```text
PostgreSQL
Redis
```

e eliminar MongoDB caso suas necessidades possam ser atendidas adequadamente pelo PostgreSQL.

Não mantenha dois bancos apenas por separação conceitual.

Se MongoDB realmente for necessário, documente exatamente:

* qual requisito exige MongoDB;
* por que PostgreSQL não é suficiente;
* qual custo operacional adicional existe.

---

# Packages

Não criar `packages/*` por padrão.

Inicialmente, prefira:

```text
apps/server
apps/web
```

Se um código precisar ser compartilhado, primeiro questione:

> Esse código realmente precisa ser compartilhado?

Evitar packages como:

```text
@repo/core
@repo/shared
@repo/auth
@repo/db
@repo/env
```

simplesmente para separar arquivos.

Um package só deve existir quando houver uma fronteira arquitetural real.

---

# Stack

Avalie a stack atual e proponha uma stack mínima.

Preferências iniciais:

### Backend

* Node.js;
* TypeScript;
* Fastify;
* Zod;
* Prisma;
* PostgreSQL.

### Frontend

* Next.js;
* React;
* Tailwind;
* shadcn/ui.

### Async

* BullMQ;
* Redis.

### Auth

* Better Auth, se continuar sendo a opção mais adequada.

### Validation

* Zod.

### Tooling

* pnpm;
* Biome;
* Vitest;
* Playwright;
* Docker.

Essas tecnologias não são obrigatórias.

Se encontrar uma alternativa significativamente mais simples ou adequada, proponha-a antes de implementar.

---

# Código

Regras:

* TypeScript strict;
* zero `any`;
* zero `@ts-ignore`;
* zero `@ts-expect-error`;
* evitar type assertions;
* funções pequenas;
* nomes explícitos;
* código orientado ao domínio;
* evitar abstrações prematuras;
* evitar design patterns sem necessidade;
* evitar classes quando funções simples forem suficientes;
* preferir composição;
* preferir imutabilidade quando fizer sentido;
* erros explícitos;
* validação nas fronteiras;
* logs estruturados;
* secrets nunca hardcoded.

---

# API

Usar:

```text
Fastify
+
Zod
```

Cada endpoint deve possuir:

* validação de input;
* autenticação quando necessário;
* autorização quando necessário;
* tratamento consistente de erros;
* logging apropriado;
* documentação OpenAPI quando aplicável.

Evitar criar DTOs duplicados sem necessidade.

O schema Zod deve ser a fonte de verdade quando isso fizer sentido.

---

# Segurança

Segurança deve existir desde o início.

Avaliar e implementar:

* autenticação;
* autorização;
* RBAC;
* tenant isolation;
* validação de input;
* rate limiting;
* security headers;
* CORS;
* proteção contra IDOR;
* proteção contra mass assignment;
* secrets;
* uploads;
* auditoria;
* sessões/tokens;
* proteção de endpoints administrativos.

Não adicionar segurança como um módulo isolado depois.

Ela deve fazer parte da arquitetura.

---

# Multi-tenancy

Analisar a implementação atual de multi-tenancy.

Preferência:

```text
tenant
   ↓
request context
   ↓
authorization
   ↓
database query
```

Garantir que um tenant nunca consiga acessar dados de outro tenant.

Avaliar se PostgreSQL Row Level Security realmente é necessário.

Não utilizar RLS simplesmente porque é uma técnica avançada.

Caso seja utilizado, documentar:

* ameaça mitigada;
* modelo de segurança;
* impacto operacional;
* estratégia de testes.

---

# Jobs

Não criar workers independentes inicialmente.

Preferir:

```text
server
  ↓
BullMQ
  ↓
Redis
```

e processar jobs no próprio processo enquanto isso for suficiente.

Separar workers somente quando houver uma necessidade concreta de:

* escala independente;
* isolamento de carga;
* disponibilidade;
* processamento pesado;
* deploy independente.

Nesse caso, documentar a decisão.

---

# Realtime

Avaliar a necessidade de Socket.IO.

Se necessário, integrar diretamente ao `apps/server`.

Evitar:

```text
server
chat-server
chat-worker
```

sem uma necessidade real.

Preferir:

```text
apps/server
├── HTTP
├── WebSocket
├── jobs
└── modules
```

---

# Frontend

Organizar por feature:

```text
apps/web/src/
├── app/
├── features/
│   ├── clients/
│   ├── proposals/
│   ├── policies/
│   ├── claims/
│   └── ...
├── components/
├── lib/
└── hooks/
```

Evitar um frontend organizado exclusivamente por tipo:

```text
components/
services/
hooks/
utils/
pages/
```

quando isso causar dificuldade para localizar uma feature.

---

# Documentação arquitetural

Criar:

```text
docs/
├── architecture.md
├── decisions/
│   ├── ADR-001-modular-monolith.md
│   ├── ADR-002-database.md
│   ├── ADR-003-authentication.md
│   └── ...
└── migration.md
```

Cada decisão importante deve responder:

```text
Context
Decision
Why
Alternatives considered
Trade-offs
Consequences
```

Não criar ADR para decisões triviais.

---

# FASE 4 — Architecture Review

Antes de implementar, apresente:

## 1. Architecture overview

Diagrama textual da arquitetura.

## 2. Repository structure

Árvore completa do novo repository.

## 3. Module boundaries

Lista dos módulos e responsabilidades.

## 4. Dependency rules

Explique quem pode depender de quem.

## 5. Data architecture

Banco, cache, jobs e storage.

## 6. Authentication

Fluxo completo.

## 7. Authorization

RBAC e tenant isolation.

## 8. API architecture

Padrão de endpoints.

## 9. Frontend architecture

Estrutura e fluxo de dados.

## 10. Deployment architecture

Local → Docker → CI → VPS.

## 11. Legacy mapping

Mapeie:

```text
legacy → new architecture
```

## 12. Removed complexity

Liste explicitamente tudo que será removido.

---

# FASE 5 — Roadmap de implementação

Depois da arquitetura aprovada, criar um roadmap incremental.

Exemplo:

```text
Phase 1 — Foundation
Phase 2 — Infrastructure
Phase 3 — Authentication
Phase 4 — Tenancy
Phase 5 — Core domains
Phase 6 — Commercial flow
Phase 7 — Policies
Phase 8 — Claims
Phase 9 — Billing
Phase 10 — Chat
Phase 11 — Notifications
Phase 12 — Observability
Phase 13 — Production deployment
```

Cada fase deve conter:

* objetivo;
* arquivos principais;
* dependências;
* implementação;
* testes;
* critérios de aceite;
* riscos.

---

# FASE 6 — Implementação

Somente depois do roadmap começar a implementação.

Não tente migrar tudo de uma vez.

Para cada módulo:

```text
1. Entender comportamento legado
2. Definir contrato
3. Implementar domínio
4. Implementar persistência
5. Implementar API
6. Implementar frontend
7. Criar testes
8. Validar comportamento
9. Revisar complexidade
```

Depois de cada módulo, perguntar:

> Existe alguma abstração que podemos remover?

A arquitetura deve ficar mais simples, não mais complexa, conforme o projeto cresce.

---

# Critério de sucesso

O novo projeto será considerado arquiteturalmente bem-sucedido se:

* possuir somente `apps/server` e `apps/web` inicialmente;
* não depender de múltiplos packages sem necessidade;
* não possuir múltiplos backend services sem necessidade;
* possuir boundaries claros entre módulos;
* possuir baixo acoplamento;
* possuir alta coesão;
* for fácil encontrar onde uma regra de negócio está implementada;
* for fácil testar regras de negócio;
* for fácil adicionar uma feature;
* possuir segurança desde o início;
* possuir observabilidade;
* possuir documentação arquitetural;
* possuir deploy reproduzível;
* e, principalmente, for mais simples de entender que o sistema legado.

---

# Princípio final

Não tente construir uma arquitetura "perfeita".

Construa a arquitetura **mais simples que atende aos requisitos atuais e que permite evolução segura**.

Sempre que considerar adicionar:

* uma camada;
* um package;
* um serviço;
* um banco;
* um design pattern;
* um abstraction;
* um framework;
* um worker;
* um container de DI;

pergunte:

> "Qual problema concreto isso resolve agora?"

Se a resposta não for clara, não adicione.

Comece pela simplicidade.

E deixe a arquitetura evoluir junto com o produto.
