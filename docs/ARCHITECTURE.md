# Atende — arquitetura planejada

**Status:** arquitetura revisada em 23/10/2026 para separar UBS e UPA e incluir lotação simples. A migration, a seed e o Worker existentes foram validados em Neon de teste; Hyperdrive ainda depende de binding Cloudflare.

## Forma da solução

Monorepo `pnpm workspaces`, monólito modular e uma API HTTP versionada. O Worker é a única porta de acesso a dados clínicos; web e mobile não falam diretamente com Neon ou R2.

```text
apps/web       React + TypeScript + Vite + Tailwind CSS + shadcn/ui
               React Router + TanStack Query + React Hook Form + Zod + Lucide
apps/mobile    React Native + Expo + Expo Router + TanStack Query
               Expo SecureStore para a sessão mobile
apps/api       Cloudflare Worker + TypeScript + Hono + Zod + OpenAPI
packages/database  Drizzle ORM, schema, relações, migrations Drizzle Kit, seeds
packages/shared    contratos/tipos e schemas Zod reutilizáveis, sem lógica de permissão
packages/config    configuração compartilhada de TypeScript, lint e formatação
docs               produto, arquitetura e plano
```

Dentro da API, cada domínio terá `routes`, `schemas`, `service`, `repository` e regras de autorização. Domínios: `auth`, `patients`, `facilities`, `queue`, `attendances`, `records`, `documents`, `referrals`, `care-plans`, `notifications`, `admin`. Hono com `@hono/zod-openapi` fornece roteamento, validação Zod e contrato OpenAPI no Worker. Rotas validam e autenticam; serviços aplicam transições e regras; repositórios fazem consultas. Validação e autorização são repetidas no servidor, independentemente da interface. [Hono em Workers](https://hono.dev/docs/getting-started/cloudflare-workers), [Hono Zod OpenAPI](https://hono.dev/examples/zod-openapi).

## Runtime e dados

- **PostgreSQL no Neon** é a fonte de verdade. Drizzle define schema e relações; Drizzle Kit gera migrations versionadas e revisadas. Aplicar migration via comando separado, nunca na inicialização do Worker. Seeds idempotentes usam somente dados fictícios e ficam restritas a ambiente local/de demonstração.
- **Conexão da Fase 1:** `pg` com `drizzle-orm/node-postgres`; o Worker usa `HYPERDRIVE.connectionString` quando configurado para Neon, e `DATABASE_URL` apenas no desenvolvimento/teste direto. Abrir/encerrar pool por requisição. A escolha substituiu o driver Neon WebSocket planejado inicialmente porque permite testar a mesma API e transações no PostgreSQL local e segue a recomendação do Cloudflare para Neon via Hyperdrive. O Worker e migrations passaram em PostgreSQL local; a conexão real Hyperdrive/Neon segue como gate. [Cloudflare: Neon](https://developers.cloudflare.com/workers/databases/third-party-integrations/neon/), [Drizzle com Hyperdrive](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/drizzle-orm/).
- **R2 privado** guarda somente bytes de PDF/imagem; PostgreSQL guarda metadados, chave opaca, hash, tamanho e estado. O Worker valida autorização e entrega o arquivo. Não usar bucket público nem URL GET pré-assinada para compartilhamento revogável: a autorização deve ser checada em cada acesso. Validar MIME real, tamanho e tipo; proteger contra documentos ativos e limitar upload. [R2 Workers API](https://developers.cloudflare.com/r2/get-started/workers-api/).
- Credenciais do Neon, segredos de sessão e bindings R2 entram por ambiente/segredos do Wrangler; nunca em git ou payload enviado ao cliente. Não registrar dados clínicos em logs de aplicação.

## Modelo de dados mínimo

IDs UUID, `created_at`/`updated_at` em entidades mutáveis, FKs explícitas e `NOT NULL` onde o fluxo exige. Nomes abaixo são tabelas; campos do pedido são preservados em `snake_case`. O esquema detalhado será fechado na Fase 1 e evoluído por migration em cada fase.

| Domínio | Tabelas e relações principais | Restrições e índices planejados |
| --- | --- | --- |
| Identidade | `users`, `auth_credentials`, `auth_sessions`, `patient_link_challenges`; `patients.user_id → users.id` opcional | E-mail normalizado único; `patients.user_id` único quando presente; token/sessão só com hash; CPF/CNS normalizados únicos quando preenchidos **após tratamento de duplicatas**. Buscar nome por índice apropriado. |
| Equipe | `doctors`, `receptionists`, `staff_memberships`; vínculo `user_id + facility_id + role`; `healthcare_facilities`, `facility_services`, `facility_hours` | CRM + UF único para médico verificado; CNES único quando preenchido; vínculo ativo único por tripla; índices por unidade, usuário e serviço. `specialties` pode ser lista controlada no MVP. |
| Operação | `queue_tickets`, `facility_arrivals`, `notifications`, `triage_records`, `attendances`, `appointments` | UBS e UPA têm filas/regras distintas. `facility_arrivals` associa a chegada ao cadastro do paciente; seu status ativo/encerrado conta lotação somente em UBS e UPA. Nas clínicas, a ocupação demonstrativa é a contagem agregada de senhas ativas da fila, sem `facility_arrivals`. `queue_tickets` guarda a senha que é exibida, enviada à conta vinculada e impressa; a senha fica atribuída ao médico escolhido pela recepção. O registro interno de chegada não expõe um segundo código. Capacidade de referência permite mostrar estado (`normal`, `alta`, `no limite`) e hora da última atualização, sem previsão de espera nem dados de outras pessoas. Hospitais e centros de diagnóstico não usam indicador de lotação no MVP. |
| Clínica | `medical_record_entries`, `medical_conditions`, `medical_documents`, `hospital_stays`, `hospital_discharges` | Entradas do histórico são append-only ou versões ligadas por `supersedes_id`, com proveniência e verificação; índices por paciente/data e atendimento; documento aponta chave R2 privada e paciente, opcionalmente atendimento. Internação/alta vinculadas a atendimento hospitalar. |
| Jornada | `referrals`, `referral_events`, `care_plans` | Encaminhamento aponta atendimento de origem, paciente, unidade de origem e destino opcional; eventos registram status anterior/novo, ator, data e justificativa. Plano aponta encaminhamento e atendimento de destino. Índices por origem/destino/status e paciente/data. |
| Apoio e segurança | `notifications`, `audit_logs`, `document_share_grants` | Notificação aponta destinatário e entidade geradora; auditoria registra ator, contexto, finalidade, recurso, ação e data, sem texto clínico; compartilhamento guarda hash do token, escopo, expiração, revogação e proteção de acesso. |

O registro clínico conserva instituição, profissional, atendimento, origem (`SELF_REPORTED`, `FACILITY`, `DOCUMENT`) e grau de verificação (`UNVERIFIED`, `REVIEWED`, `CLINICALLY_CONFIRMED`). `REVIEWED` indica somente revisão demonstrativa por profissional, jamais autenticidade oficial. Diagnóstico confirmado requer autor médico habilitado. Dados de identificação são normalizados para busca, mas o valor original pode ser apresentado formatado. Potenciais duplicatas com identificadores ausentes geram revisão humana; não há fusão automática.

### Campos e cardinalidades que orientam as migrations

- `users`: `id`, `name`, `email`, `status`, datas; `patients`: `id`, `user_id?`, `full_name`, `social_name?`, `cpf?`, `cns?`, `birth_date`, contato/endereço opcionais, datas. `User 0..1 ↔ 0..1 Patient`; `Patient` existe sem `User`. Não criar `PatientAccount`.
- `doctors`: `user_id`, CRM, UF, especialidades, RQE opcional, `verification_status`; `receptionists`: `user_id`, código opcional, `status`. `staff_memberships`: `user_id`, `facility_id`, `role`, `status`. Cada profissional pode ter N vínculos.
- `healthcare_facilities`: nome, `type` (`UBS`, `UPA`, `CLINIC`, `HOSPITAL`, `DIAGNOSTIC_CENTER`), `ownership_type`, participação SUS, CNES opcional, endereço, latitude/longitude, telefone, capacidade de referência opcional e `active`; serviços e horários são filhos da unidade. Nenhuma dessas informações de demonstração representa disponibilidade real.
- `facility_arrivals`: unidade UBS/UPA, paciente, estado, emissão e encerramento; não guarda dados clínicos nem expõe código separado. O total de registros ativos comparado à capacidade de referência da unidade gera o indicador atual de lotação. Clínicas, hospitais e centros de diagnóstico não geram esses registros no MVP. `notifications` guarda a mesma senha de atendimento da fila para a conta vinculada. `attendances`: `patient_id`, `facility_id`, `doctor_id`, `queue_ticket_id?`, início, fim, status e texto clínico estruturado. Atendimento de encaminhamento usa `queue_ticket_id = null` e fica ligado ao encaminhamento de destino; não emite senha nem cria `queue_ticket`. `queue_tickets`: unidade, paciente, setor, data/código visível, estado, prioridade registrada, emissão/chamada/conclusão. `triage_records`: atendimento/senha, profissional, motivo, observações, sinais vitais e prioridade humana.
- `medical_record_entries`: paciente, atendimento, unidade, autor, tipo, conteúdo, origem, verificação, data clínica, versão anterior opcional. `medical_documents`: paciente, atendimento opcional, tipo, data de emissão, origem, autor, verificação, chave R2 e metadados de arquivo. `medical_conditions` representa a visão atual de condição crônica, referenciando a entrada clínica que a sustenta.
- `referrals`: paciente, atendimento e unidade de origem, destino opcional, serviço, motivo, prioridade, estado, solicitante e datas. `target_attendance_id` liga o pedido aceito à ficha iniciada pelo médico de destino; essa ficha aparece na fila de trabalho sem senha. `referral_events`: encaminhamento, estado anterior/novo, ator, unidade, data e justificativa. `care_plans`: encaminhamento, atendimento de destino, resumo, achados, conduta, exames, orientações, acompanhamento e próximas ações.
- `notifications` são dirigidas a usuário ou unidade com contexto e leitura; `audit_logs` são append-only. `document_share_grants` guardam escopo por documento, hash do token/código, validade e revogação. Esses registros não duplicam o texto do prontuário.

### Estados e responsáveis

| Recurso | Transições normais | Quem inicia |
| --- | --- | --- |
| Senha | `WAITING → CALLED → IN_PROGRESS → COMPLETED`; `WAITING/CALLED → CANCELLED/NO_SHOW` | Atendente emite/chama/registra ausência; médico inicia/conclui atendimento. Prioridade só muda por profissional clínico autorizado. |
| Encaminhamento | `REQUESTED → IN_REGULATION → ACCEPTED → SCHEDULED → IN_PROGRESS → COMPLETED → RETURNED`; cancelamento justificado antes da conclusão | Médico solicita; operador autorizado faz seleção simulada/aceite/agenda; médico do destino inicia/conclui e envia plano. |

`REQUESTED` ainda não atribui vaga ou destino. Em `IN_REGULATION`, um operador autorizado escolhe manualmente entre unidades com o serviço e a unidade escolhida pode aceitar. `COMPLETED` registra desfecho no destino; `RETURNED` exige plano de cuidado enviado à origem. Estados terminais não reabrem sem procedimento explícito futuro; cada transição é validada por estado atual, unidade e papel.

## Autenticação, autorização e privacidade

1. **Sessão:** login com senha processada por KDF compatível com Web Crypto no Worker, sal único, parâmetros versionados e custo calibrado no runtime; sessão opaca aleatória, rotacionada e revogável, armazenada apenas como hash no banco. Web usa cookie `HttpOnly`, `Secure`, `SameSite` e proteção CSRF nas mutações; mobile usa token de sessão em SecureStore e header `Authorization`. Recuperação usa token de uso único com expiração, sem expor se o e-mail existe. A Fase 1 valida o KDF e o fluxo completo no Worker antes de adotar parâmetros finais. [Web Crypto em Workers](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/).
2. **RBAC contextual:** cada requisição profissional informa/usa a unidade ativa; a API confirma vínculo ativo e permissão naquele estabelecimento. Médico e atendente têm ações distintas; administrador gerencia cadastros, sem acesso clínico implícito. O front esconde ações indisponíveis, mas isso não substitui a checagem na API. A autorização inclui o ID do recurso, impedindo acesso por troca de URL/ID.
3. **Finalidade assistencial:** leitura clínica exige atendimento ativo na unidade, encaminhamento recebido/atendimento associado ou acesso do próprio paciente vinculado. A API registra motivo/contexto e acesso clínico em `audit_logs`. Busca administrativa retorna só dados necessários para identificar/cadastrar; acesso entre unidades é restrito à jornada compartilhada autorizada. Sem contexto válido, responder 403/404 sem revelar a existência do registro.
4. **Vínculo de paciente:** conta nova não recebe prontuário por informar CPF/CNS. Um profissional autorizado confere identidade presencialmente e emite desafio de uso único, curto, ligado a `Patient`; a pessoa autenticada o consome. Conflito de vínculo bloqueia operação e exige revisão humana. Toda criação/consumo fica auditada.
5. **Compartilhamento:** paciente vinculado escolhe documentos; servidor gera token aleatório cujo hash é persistido, prazo curto e código de acesso separado para o destinatário, com tentativas limitadas. Revogação e expiração são verificadas no Worker em cada download. Resposta usa `Cache-Control: no-store`; token e código não vão para logs. Link/QR é apenas a representação do mesmo acesso controlado.
6. **Abuso e falhas:** Zod em entradas, respostas de erro sem dados sensíveis, limites de tamanho, paginação e rate limit em login, recuperação, vínculo, busca e compartilhamento. Rate limit de borda é aproximado; operações de uso único e transições dependem também de constraints/transações no PostgreSQL. [Rate Limiting em Workers](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

## Regras transacionais

- A confirmação da recepção cria, na mesma transação, o registro interno de lotação e uma senha clínica por unidade/data/setor; falha em qualquer gravação cancela ambas. O paciente vê, recebe e pode imprimir somente a senha clínica. A chegada é encerrada separadamente quando a pessoa sai, atualizando a lotação sem gerar um segundo número. Chamar a próxima senha usa bloqueio/atualização condicional. Fila regular da UBS e fila urgente da UPA são separadas; prioridade da UPA é registrada por profissional habilitado, sem classificação automática. Somente UBS e UPA usam esse recurso no MVP. Na UPA, o indicador não recomenda adiar nem redirecionar urgências.
- Atendimento, senha e entrada clínica são atualizados em transação na conclusão. Conclusão de atendimento não encerra automaticamente a jornada.
- A indicação clínica de encaminhamento é salva pelo médico junto com a conclusão do atendimento; a recepção da origem seleciona a unidade parceira e despacha o pedido depois. O destino não vê nada antes do despacho. O despacho persiste cadastro do paciente e somente o snapshot da consulta encaminhada; a recepção do destino atribui um médico e a mesma transação cria notificação para esse profissional. A notificação contém nome e prioridade, e seu recurso referencia o encaminhamento clicável. A recepção do destino só vê o resumo operacional. O médico destinatário, após atribuição e validação do vínculo ativo, pode abrir o pacote e aceitar/recusar; o histórico longitudinal não integra o payload.
- Toda mudança de encaminhamento verifica transição permitida, papel e unidade e ocorre em transação. Destino só aceita serviço oferecido; seleção de destino e agendamento são ações humanas no fluxo simulado. `completed_at` é preenchido no desfecho, sem apagar eventos posteriores de retorno.
- Plano de cuidado/alta, mudança para `RETURNED`, notificação da origem e pendência de acompanhamento são persistidos juntos. Se a transação falhar, nada aparece parcialmente. As telas reconsultam a API e não presumem sucesso apenas porque um botão foi pressionado.

## Superfícies e API

API JSON `/v1`, contratos Zod e documento OpenAPI gerado/validado a partir das rotas. Recursos previstos: `/auth`, `/patients`, `/facilities`, `/queue-tickets`, `/triage-records`, `/attendances`, `/medical-record`, `/documents`, `/referrals`, `/care-plans`, `/appointments`, `/notifications`, `/me`. Consultas de dashboard são agregações filtradas pela unidade e permissão; o mobile só usa endpoints de `me` para dados pessoais. TanStack Query gerencia cache e invalidação após mutações; nunca persistir cache clínico sem requisito explícito. Formulários têm validação cliente para experiência e validação servidor para segurança.

## Decisões e limites

- Aplicações web, mobile e API compartilham contratos, mas nenhuma regra de autorização mora em `packages/shared` ou na interface.
- Transições e auditoria são síncronas no banco. Notificações são avisos internos de status; conversa/chat, push, RNDS e portabilidade oficial ficam fora do MVP.
- Migrações e seeds têm scripts separados; ambientes de teste usam banco isolado. Dados fictícios não devem ser confundidos com dados de assistência.
- A Fase 1 mediu login PBKDF2 no Worker local em menos de um segundo e validou migrations, seed e endpoints contra PostgreSQL local e Neon de teste. Hyperdrive e limites de upload serão avaliados quando houver ambiente configurado. Não há garantia de escala ou conformidade para produção assistencial.
