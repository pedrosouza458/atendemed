# AtendeMed

Plataforma demonstrativa de saúde conectada para apoiar a operação de unidades de saúde e permitir que pacientes acompanhem sua jornada de atendimento. O projeto reúne um portal web para equipes, um aplicativo para pacientes e uma API que centraliza autenticação, regras de acesso e dados.

> **Demonstração:** utilize somente dados fictícios. O AtendeMed não substitui prontuários oficiais, regulação, protocolos clínicos nem a decisão de profissionais de saúde. Lotação e unidades exibidas são ilustrativas; não representam vagas oficiais nem previsão de espera.

## O que o projeto oferece

- **Portal web para equipes:** busca e cadastro administrativo de pacientes, operação de filas e senhas, atendimento clínico, notificações e encaminhamentos entre unidades parceiras.
- **Fluxos de UBS e UPA:** filas separadas; a recepção registra a chegada, seleciona o setor e o profissional responsável e emite uma senha. Na UPA, a prioridade é definida por profissional habilitado, sem classificação automática pelo sistema.
- **Atendimento e prontuário:** ficha clínica com relato, sinais vitais, avaliação, conduta e documentos anexos. Rascunhos podem ser retomados.
- **Encaminhamentos:** o profissional registra a indicação; a recepção da unidade de origem escolhe o parceiro e envia. A recepção de destino atribui um profissional, que recebe os dados cadastrais e o atendimento encaminhado, sem acesso automático ao histórico clínico completo.
- **Aplicativo do paciente:** jornada atualizada periodicamente, histórico de atendimentos, unidades e lotação demonstrativa, exportação do prontuário e envio de laudos.
- **Acesso por instituição:** a API valida papel e vínculo do profissional com a unidade em cada operação clínica ou administrativa.

## Tecnologias

| Parte | Tecnologias |
| --- | --- |
| Web | React, TypeScript e Vite |
| Mobile | React Native e Expo |
| API | Cloudflare Workers, Hono, TypeScript e Zod/OpenAPI |
| Dados | PostgreSQL, Drizzle ORM e migrations versionadas |
| Arquivos | Cloudflare R2 privado para documentos, quando configurado |
| Monorepo | pnpm workspaces |

## Estrutura

```text
apps/
  api/          API HTTP para autenticação, pacientes, unidades, filas e documentos
  web/          Portal web para as equipes
  mobile/       App Expo para pacientes
packages/
  database/     Schema Drizzle, migrations e seed demonstrativa
  shared/       Tipos e utilitários compartilhados
  config/       Configurações compartilhadas
scripts/        Rotinas de validação dos fluxos demonstrativos
docs/           Produto, arquitetura e plano do projeto
```

## Requisitos

- Node.js 24
- pnpm 10
- PostgreSQL de desenvolvimento ou demonstração (local ou Neon)
- Para deploy: contas e recursos configurados na Cloudflare; veja [Configuração de produção](#configuração-de-produção)

## Executar localmente

### 1. Instalar dependências

```bash
pnpm install
```

### 2. Configurar ambiente e banco

Copie os arquivos de exemplo:

```bash
cp .env.example .env
cp apps/api/.dev.vars.example apps/api/.dev.vars
```

Preencha `DATABASE_URL` nos dois arquivos com o mesmo banco **de desenvolvimento ou demonstração**. Não use um banco com dados reais. O arquivo `.env` também contém `DEMO_SEED` e `DEMO_PASSWORD`; mantenha `DEMO_SEED=1` somente em ambiente demonstrativo e escolha uma senha local com pelo menos 12 caracteres.

Aplique as migrations e crie os dados fictícios:

```bash
pnpm db:migrate
pnpm db:seed
```

A seed é idempotente e bloqueia execução em produção. As contas demonstrativas recebem a senha configurada em `DEMO_PASSWORD`. Não use essa senha em outros serviços.

### 3. Iniciar API e portal web

Em terminais separados:

```bash
pnpm --filter @atende/api dev
```

```bash
pnpm --filter @atende/web dev
```

O portal abre em `http://localhost:5173`. Verifique a API em `http://localhost:8787/v1/health`; a especificação OpenAPI fica em `http://localhost:8787/v1/openapi.json`.

### 4. Entrar no portal

Use uma das contas fictícias provisionadas pela seed e a senha local definida em `DEMO_PASSWORD`. Exemplos de contas:

| E-mail | Perfil demonstrativo |
| --- | --- |
| `admin@atende.com` | Administração |
| `recepcao@atende.com` | Recepção da UBS Centro |
| `medica.ubs@atende.com` | Profissional da UBS Centro |
| `recepcao.upa@atende.com` | Recepção da UPA Centro |
| `enfermeiro.ubs@atende.com` | Profissional de atendimento da UBS |
| `recepcao.clinica.vida@atende.com` | Recepção da Clínica Vida |
| `medico.clinica@atende.com` | Profissional da Clínica Vida |
| `recepcao.diagnostico@atende.com` | Recepção do Centro de Diagnóstico |
| `medico.diagnostico@atende.com` | Profissional do Centro de Diagnóstico |
| `paciente@atende.com` | Paciente com cadastro vinculado |

A seed pode incluir outras contas e unidades fictícias. Os vínculos de cada profissional limitam as unidades que ele pode acessar. Uma conta de paciente só acessa um prontuário após vínculo autorizado; saber o CPF não libera esse acesso.

## Executar o aplicativo do paciente

Configure a URL da API em `apps/mobile/.env`:

```bash
cp apps/mobile/.env.example apps/mobile/.env
```

Para o simulador iOS local, `http://127.0.0.1:8787` aponta para a API no Mac. Para um aparelho físico, use o endereço IP local do computador e garanta que aparelho e computador estejam na mesma rede, com a porta da API acessível.

Inicie o Expo:

```bash
pnpm --filter @atende/mobile start
```

Para abrir a versão web do app do paciente:

```bash
pnpm --filter @atende/mobile web
```

A versão web do Expo usa uma origem diferente do portal profissional. Para executá-la em `http://localhost:8082`, configure `APP_WEB_ORIGIN=http://localhost:8082` em `apps/api/.dev.vars`, mantenha `EXPO_PUBLIC_API_URL=http://127.0.0.1:8787` em `apps/mobile/.env` e rode `pnpm --filter @atende/mobile exec expo start --web --port 8082`. A chave `EXPO_PUBLIC_GOOGLE_MAPS_KEY` é opcional e só deve ser configurada para builds/plataformas compatíveis com Google Maps; endereços e lotações da demonstração continuam fictícios.

## Comandos úteis

```bash
pnpm lint                         # lint do monorepo
pnpm typecheck                    # verificação TypeScript
pnpm test                         # testes da API
pnpm --filter @atende/web build   # build do portal web
pnpm build                        # build de validação da API para Workers
pnpm db:generate                  # gerar migration a partir do schema
pnpm db:migrate                   # aplicar migrations
pnpm db:seed                      # provisionar dados fictícios
```

Consulte `docs/PLAN.md` para evidências de validação e limitações conhecidas.

## Segurança e privacidade

- Use dados fictícios. Não envie dados identificáveis ou clínicos reais para este projeto demonstrativo.
- A API é a única camada que acessa PostgreSQL e R2; clientes web/mobile não devem acessar esses serviços diretamente.
- O acesso é limitado por papel e vínculo com a unidade. Operações sensíveis são validadas no servidor e auditadas.
- CPF e CNS servem para localizar cadastros, não para comprovar identidade. O vínculo de uma conta a um paciente exige conferência autorizada e código de uso único.
- Documentos ficam em armazenamento privado; não configure buckets públicos nem inclua credenciais, arquivos clínicos ou URLs de acesso nos commits.
- Mantenha `.env`, `apps/api/.dev.vars` e `apps/mobile/.env` fora do Git. Use segredos e bindings protegidos nos ambientes hospedados.
- O e-mail de recuperação é opcional em desenvolvimento. Para habilitá-lo, configure `RECOVERY_API_KEY` e `RECOVERY_FROM` com um remetente verificado no provedor de e-mail.

## Configuração de produção

A API foi estruturada para Cloudflare Workers e PostgreSQL. Em desenvolvimento, `DATABASE_URL` conecta diretamente ao PostgreSQL de teste. No Worker hospedado, configure um binding Hyperdrive apontando ao banco Neon e os secrets/vars necessários no ambiente Cloudflare. O bucket R2 de documentos deve ser privado e ligado ao binding `DOCUMENTS` da API.

Revise `apps/api/wrangler.jsonc` antes de publicar. Os valores de desenvolvimento não devem ser reutilizados em produção. Antes de qualquer uso assistencial, são necessárias avaliações de segurança, privacidade, conformidade, operação e validação clínica apropriadas; este repositório não representa uma certificação ou aprovação regulatória.

## Documentação

- [`docs/PRODUCT.md`](docs/PRODUCT.md): escopo funcional e regras do produto.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): arquitetura e modelo de dados.
- [`docs/PLAN.md`](docs/PLAN.md): progresso, evidências e itens pendentes.
- [`apps/mobile/README.md`](apps/mobile/README.md): detalhes adicionais do aplicativo Expo.

## Licença

Nenhuma licença de código foi definida neste repositório. Até que uma licença seja adicionada, todos os direitos permanecem reservados.
