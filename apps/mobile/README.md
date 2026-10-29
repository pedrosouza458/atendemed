# Aplicativo do paciente

App Expo para contas de pacientes. Usa o mesmo Worker e o mesmo banco do portal web. O prontuário e os laudos só aparecem após vínculo presencial da conta ao cadastro de paciente.

1. Configure `apps/api/.dev.vars` e `.env` como no projeto principal e aplique `pnpm db:migrate`.
2. Inicie a API com `pnpm --filter @atende/api dev --port 8787`.
3. Copie `apps/mobile/.env.example` para `apps/mobile/.env` e ajuste `EXPO_PUBLIC_API_URL`. No simulador iOS local, mantenha `http://127.0.0.1:8787`; em um telefone, use o IP local do computador e disponibilize o Worker nesse endereço.
4. Inicie com `pnpm --filter @atende/mobile start`. Abra o QR no Expo Go ou execute no simulador.
5. Para testar o percurso completo, entre com `fluxo.paciente@atende.com` e a senha `Atende123!` no banco de demonstração preparado. O cadastro dessa conta está vinculado ao CPF `981.816.910-75` na seed fictícia.

## Testar no navegador sem túnel

1. Em `apps/api/.dev.vars`, configure `APP_WEB_ORIGIN=http://localhost:8082` além de `APP_ORIGIN=http://localhost:5173`.
2. Inicie a API para o paciente: `pnpm --filter @atende/api dev --ip 127.0.0.1 --port 8789`.
3. Em `apps/mobile/.env`, defina `EXPO_PUBLIC_API_URL=http://127.0.0.1:8789`. Na pasta `apps/mobile`, inicie `pnpm exec expo start --web --port 8082`.
4. Abra `http://localhost:8082` no Mac. O portal da equipe continua em `http://localhost:5173` e usa a API na porta 8787. Ambos usam o mesmo banco de demonstração.

No Expo Web, a sessão fica na aba do navegador e permanece após atualizar a página; fechar a aba encerra esse armazenamento local. O mapa web é ilustrativo com posições e lotação das unidades fictícias; o mapa nativo continua disponível no app de iPhone/Android.

A tela **Unidades** mostra o mapa e a lotação de UBS e UPA. No Expo Go do iPhone, o mapa usa o provedor nativo; em um build próprio, configure `EXPO_PUBLIC_GOOGLE_MAPS_KEY` e reconstrua o app para usar Google Maps. Os endereços, coordenadas, capacidades e dados de atendimento da seed são fictícios. A jornada consulta a API a cada 10 segundos enquanto o app está aberto. A clínica mostra sua ocupação parcial na etapa de encaminhamento.

A exportação do prontuário gera um PDF local e usa o compartilhamento do aparelho. Laudos PDF, PNG e JPEG de até 10 MB ficam em R2 privado. O armazenamento R2 do `wrangler dev` é local; um ambiente compartilhado precisa de um bucket R2 configurado. O app não foi validado em simulador ou aparelho neste ambiente.
