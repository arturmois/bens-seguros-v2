# Bens Seguros — Handoff do Pivot para o MVP (repo v2)

## 0. Contexto de execução

**Este handoff é executado no repositório `bens-seguros-v2`.**

Decisão tomada (2026-09-23): o MVP **continua no codebase do v2**, que é pivotado de ERP para o escopo deste documento. Não haverá repositório novo nem reescrita.

A análise e o roadmap já foram produzidos em [`architecture-analysis.md`](./architecture-analysis.md) (AS-IS, gap analysis, arquitetura recomendada, roadmap F0–F11, ADRs candidatos, riscos). **Não refazer essa análise do zero**: validá-la contra o código e seguir a partir dela.

### O que o v2 já entrega e é mantido

Fases 1–4 do v2, verificadas (`.specs/features/*/verification.md`):

- tenancy por RLS forçado no PostgreSQL + `db.withTenant` (ADR-004);
- Better Auth: e-mail/senha, verificação, reset, 2FA, rate limit persistido, Turnstile, bloqueio de e-mail temporário (ADR-003);
- organizações, membros, convites, onboarding com trial, troca de organização ativa;
- RBAC por mapa estático + `requirePermission` obrigatório + `scopeFor` (carteira) (ADR-005, ADR-010);
- auditoria sem PII (AD-008);
- fila transacional com pg-boss (`enqueue(tx)`) (ADR-006);
- Socket.IO autenticado por cookie;
- termos versionados do usuário do painel;
- Docker + Caddy + staging (ADR-008);
- harness de testes com PostgreSQL real, `withTwoTenants`, `withTwoSalespeople`, teste de schema e de arquitetura.

### O que muda em relação ao v2

| Item do v2 | Decisão no pivot |
| --- | --- |
| Escopo ERP (apólices, comissões, sinistros, assistências, documentos, renovação, endossos) | **fora** do MVP; sai do roadmap e dos docs |
| Billing com Asaas, planos e faturas | **fora**; fica só trial + status da organização (§38–39) |
| Meta Cloud API, Messenger, Instagram | **fora**; WhatsApp só via Baileys (§13) |
| Storage S3/MinIO, PDF | **remover**; logo da corretora no PostgreSQL até existirem anexos |
| Papéis OWNER, ADMIN, MANAGER, COMMERCIAL, VIEWER | **ADMIN, MANAGER, COMMERCIAL** (§7); invariante "≥ 1 ADMIN ativo" substitui "OWNER único" |
| ADR-006: Baileys no processo do server | **substituído**: runtime WhatsApp com ciclo de vida próprio (§14), mesmo código, outro entrypoint |
| Chat com status único (`BOT_ACTIVE`, `WAITING_HUMAN`…) do legado | **estado × responsável** (§17–18) |
| `docs/architecture.md`, `roadmap.md`, `migration.md`, `.specs/STATE.md` descrevendo o ERP | **reescrever** para o MVP (contexto errado engana agentes) |

### Decisões ainda abertas

Estão em `architecture-analysis.md` §15:

- semântica de `WAITING` (bloqueia a Fase F2);
- aceite LGPD no WhatsApp (bloqueia a Fase F9);
- premissas P1–P6, a confirmar na revisão.

---

## 1. Objetivo

O projeto **Bens Seguros** será pivotado para um MVP SaaS focado em:

> **Captura de leads + atendimento com IA + handoff humano + acompanhamento comercial de propostas.**

A análise do codebase e o roadmap **já existem** (`architecture-analysis.md`). Esta etapa, no repo v2, é **preparar o pivot**.

O agente deve:

1. rodar os gates do v2 (`pnpm lint && pnpm typecheck && pnpm test && pnpm build`) e confirmar que a base está verde;
2. validar `architecture-analysis.md` contra o código atual do v2 e apontar divergências;
3. conduzir as decisões abertas com o usuário;
4. escrever os ADRs do pivot (§13 da análise), marcando os ADRs do v2 revisados ou substituídos;
5. reescrever `docs/architecture.md`, `docs/roadmap.md`, `CLAUDE.md` e `.specs/STATE.md` para o escopo do MVP, e aposentar `docs/migration.md` (paridade com o ERP não é mais meta);
6. planejar a Fase F0 (poda do código ERP) em `.specs`, com o processo `tlc-spec-lean` do v2.

**Não implementar funcionalidades nesta etapa.** A poda de código (F0) só começa depois de o roadmap ser revisado e aprovado.

---

# 2. Princípio central

A arquitetura deve ser consequência dos requisitos.

Não queremos:

- arquitetura por moda;
- microsserviços prematuros;
- abstrações especulativas;
- infraestrutura distribuída sem necessidade;
- complexidade apenas porque "pode crescer";
- AI colocada em todos os lugares;
- abstrações genéricas sem segundo caso de uso.

Princípio:

> **Complexidade precisa ser conquistada pelos requisitos.**

Ao mesmo tempo, não devemos criar decisões que impeçam uma evolução razoável.

O objetivo é:

> **Simple now, evolvable later.**

---

# 3. Contexto do produto

Bens Seguros é um SaaS para corretoras de seguros.

A nova proposta de valor é:

```text
Corretora
    ↓
Link público
    ↓
Cliente final
    ↓
Web Chat / WhatsApp
    ↓
IA
    ↓
Captura e qualificação do lead
    ↓
Handoff humano quando necessário
    ↓
Comercial
    ↓
Oportunidade / Proposta
    ↓
Kanban
    ↓
Follow-up
```

O MVP não pretende ser um ERP completo de corretora.

Ficam fora do núcleo inicial:

- emissão de apólices;
- cálculo completo de seguros;
- integração com seguradoras;
- sinistros;
- comissões complexas;
- renovação;
- gestão completa de documentos;
- múltiplos módulos administrativos não relacionados ao objetivo comercial.

---

# 4. Escala inicial

Requisitos assumidos:

- 10–50 corretoras;
- aproximadamente até 10 usuários por corretora;
- dezenas de conversas simultâneas;
- crescimento futuro possível;
- não projetar para milhões de usuários neste momento.

Princípio:

> **Ready to scale ≠ scaled from day one.**

A arquitetura não deve criar obstáculos desnecessários para crescimento horizontal, mas também não deve implementar infraestrutura de escala antes de existir necessidade.

---

# 5. Disponibilidade e operação

MVP:

- sem SLA formal;
- pequenas indisponibilidades são aceitáveis;
- perda de dados não é aceitável;
- conversas não podem ser perdidas;
- mensagens devem possuir persistência durável;
- backup automático periódico;
- capacidade de restauração em caso de falha grave.

---

# 6. Multi-tenancy

O sistema é SaaS multi-tenant.

Cada corretora representa uma organização/tenant.

Requisito fundamental:

> Uma organização jamais pode acessar dados de outra organização.

Isso deve ser garantido no servidor e/ou banco.

Não confiar apenas em:

- frontend;
- filtros visuais;
- parâmetros enviados pelo cliente.

Todos os dados relevantes devem possuir isolamento por tenant.

---

# 7. Usuários e RBAC

Papéis iniciais:

### ADMIN

Responsável pela administração da organização.

### MANAGER

Responsável pela gestão da operação comercial.

### COMMERCIAL

Responsável pelo atendimento e operação comercial.

Regras:

- RBAC existe desde o MVP;
- autorização deve acontecer no backend;
- não criar matriz excessivamente complexa de permissões;
- novas permissões devem nascer de requisitos reais.

### Carteira

`COMMERCIAL`:

- acessa sua carteira;
- atende seus leads/conversas;
- acompanha suas oportunidades.

`MANAGER` e `ADMIN` possuem visão da operação conforme suas responsabilidades.

---

# 8. Distribuição de leads

Novo lead:

```text
Novo lead
    ↓
Fila
    ├── ADMIN/MANAGER atribui
    │
    └── COMMERCIAL assume
```

Não haverá distribuição automática/round-robin inicialmente.

Requisito de consistência:

> Dois comerciais não podem assumir o mesmo lead simultaneamente.

---

# 9. Identidade do cliente

No MVP:

- telefone é o identificador principal;
- documento não será coletado;
- e-mail pode ser coletado como informação comercial;
- e-mail não será utilizado para identidade.

Telefone:

- deve ser normalizado;
- é único dentro de uma organização;
- pode existir em organizações diferentes.

O cliente pode possuir várias conversas:

```text
Contato
 ├── Conversa A
 ├── Conversa B
 └── Conversa C
```

Cada conversa possui seu próprio histórico e canal.

---

# 10. Canais

O MVP possui dois canais reais:

1. Web Chat
2. WhatsApp via Baileys

Não tratar canais como uma abstração especulativa.

Existe uma necessidade real de abstração porque os dois canais precisam alimentar o mesmo domínio de:

- contatos;
- conversas;
- mensagens;
- leads;
- atendimento;
- IA;
- handoff.

Conceito:

```text
Web Chat ─────┐
              ├── Channel Boundary
WhatsApp ─────┘
                    ↓
              Conversation Domain
                    ↓
              Lead / AI / Human
```

---

# 11. Web Chat

Cada corretora possui:

- link público;
- único;
- estável;
- sem necessidade de login do cliente.

O link deve abrir diretamente o chatbot da corretora.

O cliente:

1. acessa o link;
2. informa o telefone;
3. aceita o aviso/termos;
4. inicia o atendimento.

---

# 12. Personalização do Web Chat

MVP:

- nome da corretora;
- logo;
- mensagem inicial;
- identidade visual básica.

Fora do MVP:

- construtor de chatbot;
- editor visual de fluxos;
- automações complexas.

---

# 13. WhatsApp

WhatsApp será integrado através do **Baileys**.

Uma corretora pode possuir:

- um ou mais números;
- cada número representa um canal independente.

As conexões devem funcionar mesmo quando nenhum usuário estiver com o painel aberto.

Requisitos:

- detectar desconexões;
- tentar reconectar automaticamente;
- preservar sessão quando possível;
- solicitar novo pareamento quando necessário;
- informar a corretora quando novo QR Code for necessário.

---

# 14. Runtime do WhatsApp

O processo que mantém Baileys deve possuir ciclo de vida independente do processo web/API.

Importante:

> Isso não significa necessariamente microsserviço.

Pode existir:

```text
Monorepo / Sistema
├── Web/Application Runtime
└── WhatsApp Runtime
```

Compartilhando código de domínio/aplicação quando apropriado.

**Decisão proposta** (`architecture-analysis.md` §8, ADR-C): o mesmo `apps/server` com um segundo entrypoint (`whatsapp`). É dono único das sessões por advisory lock, guarda o estado de auth cifrado no PostgreSQL e se comunica com a API só pelo banco: pg-boss para comandos e `NOTIFY` transacional para eventos. Isso substitui a parte do Baileys no ADR-006 do v2. Validar primeiro com o spike S1.

---

# 15. Mensagens

Toda mensagem recebida ou enviada deve ser persistida de forma durável.

Requisitos:

- preservar ordem cronológica;
- evitar duplicação;
- processamento idempotente;
- permitir reprocessamento;
- registrar estado das mensagens enviadas.

Estados mínimos de envio:

```text
PENDING
SENT
FAILED
```

Mensagens de uma mesma conversa devem ser processadas em ordem.

Conversas diferentes podem ser processadas independentemente.

---

# 16. Mídia

Anexos ficam fora do MVP.

No WhatsApp:

- mensagens não textuais não serão processadas como conteúdo comercial;
- o usuário deve receber orientação clara sobre a limitação atual.

---

# 17. Estado da conversa

Estados:

```text
OPEN
WAITING
CLOSED
```

Uma conversa encerrada pode ser reaberta quando receber nova mensagem.

O histórico anterior deve ser preservado.

---

# 18. Controle do atendimento

Separar conceitualmente:

### Estado da conversa

```text
OPEN
WAITING
CLOSED
```

### Responsável

```text
AI
QUEUE
HUMAN
```

Exemplo:

```text
OPEN + AI
    ↓
IA não consegue continuar
    ↓
OPEN + QUEUE
    ↓
COMMERCIAL assume
    ↓
OPEN + HUMAN
```

---

# 19. Handoff

Existem dois tipos.

### Manual

O comercial pode assumir a conversa a qualquer momento.

Quando assume:

> IA deixa de responder automaticamente.

### Automático

A IA deve conseguir reconhecer quando não consegue conduzir o atendimento de maneira confiável.

Nesse caso:

```text
AI
 ↓
HANDOFF
 ↓
QUEUE
 ↓
HUMAN
```

Se não houver humano disponível:

> conversa permanece na fila.

A IA não deve retomar automaticamente.

---

# 20. Retorno para IA

Depois que um humano assume:

> somente uma ação explícita do humano pode devolver o controle para a IA.

Nunca fazer essa transição automaticamente.

---

# 21. Encerramento

`COMMERCIAL` pode encerrar suas próprias conversas.

`MANAGER` e `ADMIN` podem encerrar qualquer conversa da organização.

Se uma conversa encerrada receber nova mensagem:

> deve ser reaberta automaticamente.

---

# 22. IA — princípio AI-first

A IA é uma capacidade central do produto.

Ela deve:

- conversar;
- interpretar;
- coletar informações;
- resumir;
- identificar intenção;
- auxiliar o processo comercial;
- utilizar ferramentas;
- detectar quando deve realizar handoff.

Mas:

> **A IA não é a fonte de verdade do sistema.**

O sistema continua responsável por:

- regras de negócio;
- autorização;
- persistência;
- consistência;
- estados;
- operações críticas.

---

# 23. AI Tools

A IA terá acesso a ferramentas específicas.

Conceito:

```text
AI
 ↓
Tool
 ↓
Application Layer
 ↓
Domain Rules
 ↓
Infrastructure
```

A IA:

- não acessa banco diretamente;
- não possui SQL;
- não possui tool genérica de escrita;
- não recebe acesso irrestrito aos dados.

Cada tool deve possuir:

- capacidade explícita;
- escopo explícito;
- autorização;
- validação.

Exemplos futuros:

```text
get_lead
get_proposal
get_proposal_status
update_lead_information
request_human
```

Isso permitirá evoluir a IA no futuro para funcionalidades como:

> "Qual o status da minha proposta?"

sem alterar a arquitetura fundamental do chatbot.

---

# 24. Escrita pela IA

IA pode realizar operações de baixo risco relacionadas a:

- captura de informações;
- atualização do contexto do lead;
- dados da conversa.

IA não deve executar autonomamente operações comerciais críticas como:

- alterar valores;
- marcar proposta como ganha;
- alterar condições comerciais;
- operações equivalentes.

---

# 25. Indisponibilidade da IA

Se o provedor de IA estiver indisponível:

```text
Cliente
 ↓
Mensagem persistida
 ↓
IA indisponível
 ↓
Fila humana
```

O atendimento não pode ser perdido.

IA é uma capacidade do sistema, não uma dependência para preservar a conversa.

---

# 26. Provedor de IA

Implementar inicialmente um único provedor.

Porém:

> detalhes específicos do fornecedor não devem contaminar o domínio.

Deve existir uma fronteira arquitetural que permita trocar o provedor posteriormente.

Não implementar múltiplos providers agora.

---

# 27. IA assíncrona

O processamento da IA não deve depender de manter uma requisição HTTP aberta.

Fluxo:

```text
Cliente envia mensagem
        ↓
Mensagem persistida
        ↓
Resposta rápida
        ↓
Processamento assíncrono
        ↓
IA gera resposta
        ↓
Mensagem persistida
        ↓
Realtime
```

---

# 28. Contexto da IA

Não enviar necessariamente todo o histórico bruto para o modelo a cada interação.

A aplicação deve fornecer apenas o contexto relevante.

A estratégia pode futuramente envolver:

- janela de contexto;
- resumo;
- recuperação seletiva;
- outras estratégias.

Não decidir implementação agora.

---

# 29. Consumo de IA

O uso de IA deve ser atribuível à organização.

Isso permitirá futuramente:

- quotas;
- limites;
- planos;
- cobrança por uso.

Também deve ser possível estabelecer limites por organização.

Quando o limite for atingido:

> novas execuções de IA podem ser bloqueadas/degradadas, mas atendimento humano e persistência continuam funcionando.

---

# 30. Realtime

Mensagens devem aparecer para cliente e corretor em aproximadamente:

> **até 2 segundos.**

Não exigir no MVP:

- typing indicators;
- presença online;
- read receipts;
- delivery avançado.

A tecnologia para alcançar isso ainda deve ser decidida na fase arquitetural.

---

# 31. Comercial

Objetivo:

```text
Lead
 ↓
Oportunidade
 ↓
Proposta
 ↓
Follow-up
 ↓
Ganha / Perdida
```

Não implementar:

- cálculo de cotação;
- integração com seguradoras;
- emissão de apólice.

---

# 32. Kanban

O MVP terá quadro Kanban comercial.

As etapas devem ser baseadas no quadro existente do **Bens Seguros v1**, evitando inventar um fluxo comercial novo sem necessidade.

O Kanban deve permitir:

- visualizar oportunidades;
- movimentar entre etapas;
- respeitar autorização;
- registrar alterações para auditoria.

Inicialmente:

> etapas padrão/fixas.

Customização de etapas fica para evolução futura.

---

# 33. Follow-up

O corretor pode definir um próximo follow-up para lead/oportunidade.

O sistema deve indicar quando existe acompanhamento pendente.

MVP:

- acompanhamento dentro do painel;
- sem dependência de e-mail;
- sem push;
- sem Telegram.

---

# 34. Histórico

Preservar:

- histórico completo das conversas;
- principais interações comerciais;
- contexto necessário para outro corretor continuar o atendimento.

Outro corretor autorizado deve conseguir entender o contexto sem depender da memória do corretor anterior.

---

# 35. Auditoria

Registrar pelo menos:

- alteração de lead;
- alteração de oportunidade/proposta;
- mudança de etapa;
- atribuição;
- handoff;
- entrada/saída de atendimento humano;
- criação/alteração de follow-up.

Registrar:

- quem;
- quando;
- ação relevante.

Não criar auditoria completa de cada operação interna.

---

# 36. SaaS / onboarding

O onboarding deve ser:

> **extremamente simples.**

Self-service.

Fluxo desejado:

```text
Cadastro
 ↓
Cria organização
 ↓
Usuário vira ADMIN
 ↓
Configuração mínima
 ↓
Web Chat disponível
 ↓
Primeiro lead
```

Não depender de intervenção manual para provisionar o tenant.

Usuários adicionais podem ser convidados posteriormente.

---

# 37. Ativação do WhatsApp

Web Chat:

> disponível imediatamente.

WhatsApp:

> configuração posterior e opcional.

Uma corretora não deve precisar configurar WhatsApp para experimentar o produto.

---

# 38. SaaS / Free Trial

Existe Free Trial.

Durante o trial:

> organização utiliza o produto normalmente.

Após expiração:

> novas operações podem ser bloqueadas.

Dados devem permanecer preservados.

Se houver contratação posterior:

> organização pode ser reativada sem perda de dados.

---

# 39. Suspensão

O sistema deve conseguir suspender uma organização sem apagar seus dados.

Isso pode futuramente representar:

- trial expirado;
- cancelamento;
- inadimplência;
- suspensão administrativa.

Não implementar ainda uma máquina de estados excessivamente complexa.

---

# 40. Encerramento da organização

Ao encerrar uma organização:

> não realizar exclusão física imediata.

Preservar os dados conforme política de retenção.

Exclusão/anonimização definitiva será tratada posteriormente conforme LGPD.

---

# 41. LGPD / privacidade

LGPD é requisito desde o MVP.

Cliente deve aceitar aviso/termos antes de iniciar atendimento.

O aceite deve ser persistido no backend contendo pelo menos:

- versão;
- momento do aceite.

Cookies/local storage podem auxiliar a UX, mas não são fonte de verdade.

---

# 42. Dados pessoais

MVP:

- telefone;
- eventualmente e-mail;
- dados comerciais necessários.

Documento pessoal:

> fora do MVP.

---

# 43. Rate limiting

Canais públicos devem possuir proteção contra abuso.

Mínimo:

- rate limiting;
- mecanismos básicos contra abuso.

Não criar sistema sofisticado de antifraude inicialmente.

---

# 44. Observabilidade

MVP deve possuir:

- logs estruturados;
- correlação de requisições/conversas;
- registro de erros;
- métricas básicas;
- health checks.

Não exigir inicialmente:

- tracing distribuído;
- APM sofisticado;
- observabilidade multi-região.

---

# 45. Testes

Testes automatizados para comportamentos críticos:

- regras de negócio;
- autorização;
- multi-tenancy;
- processamento de mensagens;
- handoff;
- concorrência na atribuição;
- integrações críticas.

Testes E2E para principais fluxos do usuário.

Não perseguir uma porcentagem artificial de coverage.

---

# 46. Deploy

MVP:

> **VPS + Docker**

Motivos/restrições:

- Baileys exige processos persistentes;
- queremos controle operacional;
- não queremos depender inicialmente de serverless;
- custo deve permanecer baixo.

---

# 47. Processamento assíncrono

O sistema deve suportar tarefas em background.

Exemplos:

- IA;
- retries;
- processamento de mensagens;
- follow-ups;
- tarefas futuras.

Requisitos:

- não bloquear fluxo principal quando não necessário;
- permitir retry;
- permitir reprocessamento;
- lidar com falhas.

A tecnologia ainda não deve ser decidida neste documento.

---

# 48. Métricas

Métricas comerciais básicas:

- leads recebidos;
- leads atendidos;
- oportunidades;
- propostas;
- ganhos/perdas;
- tempo até primeiro atendimento;
- conversão por etapa.

Sem:

- data warehouse;
- analytics separado;
- infraestrutura analítica dedicada.

---

# 49. Exportação

Exportação completa dos dados:

> fora do MVP.

Mas a arquitetura não deve criar obstáculos para futura exportação de:

- contatos;
- leads;
- conversas;
- propostas;
- histórico.

---

# 50. Conceitos de arquitetura que estamos estudando

Este projeto também é um laboratório prático para aplicar os conceitos estudados no roadmap de Software Architecture.

O agente deve considerar explicitamente:

## Architecture driven by requirements

Não escolher arquitetura antes de entender:

- requisitos funcionais;
- requisitos não funcionais;
- restrições;
- trade-offs.

---

## Complexity must be earned

Não adicionar:

- microsserviços;
- Redis;
- Kafka;
- Kubernetes;
- event bus;
- abstrações genéricas;
- múltiplos bancos;
- múltiplos providers;

sem requisito concreto.

---

## Separation of concerns

Separar responsabilidades sem criar camadas artificiais.

Exemplo conceitual:

```text
Interface / Channel
        ↓
Application
        ↓
Domain
        ↓
Infrastructure
```

---

## Dependency direction

Detalhes de infraestrutura não devem dominar o domínio.

Exemplos:

```text
Domain
  ↓
não deve conhecer Baileys
não deve conhecer Prisma
não deve conhecer Next.js
não deve conhecer provider de IA
```

---

## Ports & Adapters

Aplicar quando houver uma fronteira real.

Exemplos naturais neste projeto:

- WhatsApp/Baileys;
- Web Chat;
- IA provider;
- persistência;
- storage;
- jobs.

Não transformar cada classe em interface apenas por princípio.

---

## Modularity

Organizar o sistema por capacidades de negócio.

Possíveis áreas:

```text
Identity
Organizations
Contacts
Conversations
Channels
Leads
Sales
Follow-ups
AI
Billing
```

Os módulos devem possuir fronteiras claras.

---

## Cohesion / Coupling

Buscar:

> alta coesão + baixo acoplamento.

Especialmente entre:

- IA;
- canais;
- conversas;
- comercial.

---

## Transactional consistency

Operações que precisam ser atomicamente consistentes devem ser tratadas como tal.

Exemplo:

```text
Assumir lead
```

não pode resultar em dois comerciais possuindo o mesmo lead.

---

## Idempotency

Particularmente importante para:

- WhatsApp;
- retries;
- jobs;
- IA;
- mensagens.

---

## Asynchronous processing

Usar assíncrono quando o requisito justificar.

Não transformar todo fluxo em event-driven apenas por preferência arquitetural.

---

## Realtime

Escolher a tecnologia de realtime com base nos requisitos:

> ~2 segundos.

Não assumir WebSocket, SSE ou polling antes de analisar os trade-offs.

---

## Resilience

Falhas externas não devem causar perda de dados.

Principalmente:

- IA;
- Baileys;
- jobs;
- serviços externos.

---

## Observability

A arquitetura deve permitir entender:

> o que aconteceu, onde aconteceu e em qual conversa/tenant aconteceu.

---

# 51. Conceitos de AI Engineering

Este projeto também deve aplicar os conceitos de engenharia de software para sistemas AI-first.

## AI não é domínio

A IA não deve virar o centro da lógica de negócio.

Ela é uma capacidade que utiliza o domínio.

---

## Structured output

Quando a IA precisar produzir informação para o sistema:

```text
Prompt
 ↓
Structured Output
 ↓
Validation
 ↓
Application
```

Não confiar em texto livre para controlar diretamente regras críticas.

---

## Tools

Tools são interfaces controladas para capacidades do sistema.

Não são acesso genérico ao sistema.

---

## Human in the loop

A IA deve reconhecer seus limites.

```text
AI
 ├── consegue → continua
 │
 └── não consegue → humano
```

---

## AI safety boundaries

A IA não deve:

- executar SQL;
- ignorar autorização;
- alterar dados críticos arbitrariamente;
- acessar tenant diferente;
- decidir regras de negócio críticas.

---

## AI observability

O sistema deve futuramente permitir observar:

- execuções;
- consumo;
- falhas;
- ferramentas utilizadas;
- tempo de processamento;
- tenant;
- contexto relevante.

---

## Model/provider independence

Evitar espalhar SDK específico do provider pelo domínio.

---

# 52. Conceitos de Clean Code

Aplicar:

- funções pequenas quando isso melhora compreensão;
- nomes explícitos;
- early returns;
- guard clauses;
- redução de nesting;
- pattern matching quando fizer sentido;
- composição;
- baixo acoplamento;
- responsabilidade única.

Evitar:

- abstração prematura;
- classes artificiais;
- funções gigantes;
- condicionais profundamente aninhadas;
- duplicação acidental;
- `any`;
- `ts-ignore`;
- código mágico.

Clean Code deve servir à compreensão do sistema, não virar dogma.

---

# 53. Filosofia para agentes de IA

O codebase deve ser desenvolvido considerando agentes como parte do processo de engenharia.

Por isso:

- arquitetura deve ser legível;
- módulos devem possuir fronteiras claras;
- decisões arquiteturais devem ser documentadas;
- regras importantes devem estar explícitas;
- testes devem proteger comportamento;
- agentes não devem inferir regras críticas apenas pelo código.

O agente deve preferir:

> entender → especificar → planejar → implementar → testar → validar.

Não:

> editar código imediatamente.

---

# 54. O que o agente NÃO deve fazer nesta etapa

Não:

- implementar funcionalidades;
- remover código ERP antes da aprovação do roadmap (isso é a F0);
- trocar stack (Fastify + Vite/TanStack Router + Prisma + PostgreSQL + pg-boss + Socket.IO ficam);
- instalar dependências;
- criar abstrações;
- enfraquecer testes ou gates do v2.

Esta etapa é exclusivamente:

> **validação da análise + decisões + ADRs + docs do pivot + plano da F0.**

---

# 55. Missão do agente

> **Status:** as Fases 1–6 abaixo foram executadas em `architecture-analysis.md` (a Fase 5 concluiu: manter SPA Vite + Fastify, não usar Next.js full-stack). No repo v2, o agente **revisa** esse resultado contra o código, em vez de refazê-lo. O texto original das fases é mantido como referência do que a análise precisa cobrir.

Ao entrar no codebase:

### Fase 1 — Reconhecimento

Mapear:

- estrutura atual;
- stack;
- módulos;
- dependências;
- banco;
- autenticação;
- tenancy;
- canais;
- IA;
- jobs;
- infraestrutura;
- testes.

---

### Fase 2 — Estado atual

Produzir:

```text
AS-IS
```

Identificar:

- o que existe;
- o que funciona;
- o que está incompleto;
- o que está obsoleto;
- o que pode ser reaproveitado;
- o que deve ser removido.

---

### Fase 3 — Gap Analysis

Comparar:

```text
AS-IS
   ↓
Requisitos deste documento
   ↓
GAPS
```

Classificar cada gap como:

- manter;
- adaptar;
- refatorar;
- remover;
- criar.

---

### Fase 4 — Arquitetura proposta

Propor:

```text
TO-BE
```

Incluindo:

- runtime(s);
- módulos;
- fronteiras;
- persistência;
- canais;
- realtime;
- IA;
- tools;
- jobs;
- autenticação;
- autorização;
- observabilidade;
- deploy.

Para cada decisão importante:

> apresentar requisito → opções → trade-offs → decisão recomendada.

---

### Fase 5 — Avaliar Next.js Full-stack

Fazer análise específica:

## Opção A

```text
Next.js Full-stack
+
WhatsApp Runtime separado
+
PostgreSQL
```

## Opção B

```text
Next.js
+
Backend separado
+
WhatsApp Runtime
+
PostgreSQL
```

Avaliar:

- complexidade;
- deploy;
- realtime;
- Baileys;
- jobs;
- testes;
- domínio;
- escalabilidade;
- observabilidade;
- manutenção;
- DX;
- custo operacional.

Não escolher baseado em preferência pessoal.

---

### Fase 6 — Roadmap

Criar roadmap incremental.

Cada fase deve possuir:

- objetivo;
- requisitos atendidos;
- dependências;
- mudanças arquiteturais;
- entregáveis;
- testes;
- critérios de conclusão.

Priorizar:

```text
Foundation
 ↓
Identity / Tenant
 ↓
Core Conversation
 ↓
Web Chat
 ↓
AI
 ↓
Human Handoff
 ↓
Lead / Commercial
 ↓
Kanban
 ↓
Follow-up
 ↓
WhatsApp
 ↓
SaaS / Trial
 ↓
Observability / Production
```

A ordem final deve ser determinada pelo agente após análise do codebase.

---

# 56. Formato esperado da saída

> **Nesta etapa (repo v2)**, a saída é:
>
> 1. relatório curto de validação: gates do v2 e divergências entre a análise e o código;
> 2. decisões abertas resolvidas ou registradas;
> 3. ADRs do pivot em `docs/decisions/`;
> 4. `docs/architecture.md`, `docs/roadmap.md`, `CLAUDE.md` e `.specs/STATE.md` reescritos para o MVP;
> 5. plano da F0 em `.specs/features/`.
>
> O formato abaixo é o que `architecture-analysis.md` já segue, e vale para revisões dela.

O agente deve produzir:

## 1. Executive Summary

Resumo do estado atual e direção recomendada.

## 2. AS-IS Architecture

Arquitetura existente.

## 3. Requirements Summary

Requisitos funcionais e não funcionais.

## 4. Gap Analysis

Tabela:

| Requisito | Estado atual | Gap | Ação |
|---|---|---|---|

## 5. Architecture Options

Comparação das alternativas.

## 6. Recommended Architecture

Arquitetura recomendada e justificativa.

## 7. Domain / Module Boundaries

Fronteiras propostas.

## 8. Runtime Architecture

Processos necessários e responsabilidades.

## 9. AI Architecture

IA, tools, provider boundary, jobs, handoff e human-in-the-loop.

## 10. Data Architecture

Persistência, tenancy, consistência e mensagens.

## 11. Security Architecture

Auth, RBAC, tenancy, rate limiting e LGPD.

## 12. Roadmap

Roadmap incremental.

## 13. ADR Candidates

Decisões que devem virar ADRs.

## 14. Risks

Riscos técnicos e de produto.

## 15. Open Questions

Somente questões que realmente impedem uma decisão.

---

# 57. Regra final

Durante a análise, sempre perguntar:

> **"Qual requisito justifica essa complexidade?"**

Se não houver uma resposta concreta:

> não adicionar a complexidade.

O objetivo não é construir a arquitetura mais sofisticada.

O objetivo é construir a **menor arquitetura capaz de satisfazer corretamente os requisitos atuais, mantendo caminhos claros de evolução**.

# 58. Resultado esperado

Ao final desta tarefa, não queremos código.

Queremos sair com:

```text
Requisitos
    ↓
Restrições
    ↓
Trade-offs
    ↓
Arquitetura
    ↓
Roadmap
    ↓
Implementação futura
```

A implementação só começa depois que o roadmap for revisado e aprovado.