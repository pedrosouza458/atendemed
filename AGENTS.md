# Instruções para agentes — Atende

- Leia `docs/PRODUCT.md`, `docs/ARCHITECTURE.md` e `docs/PLAN.md` antes de implementar. Trabalhe somente na fase solicitada e atualize o plano com o progresso comprovado.
- Mantenha o monorepo pnpm e o monólito modular. API em Cloudflare Workers; PostgreSQL/Neon com Drizzle via `pg`/Hyperdrive; R2 privado para documentos. Não introduza driver ou dependência incompatível com Workers.
- Dados clínicos e autorizações passam pela API. Aplique RBAC por instituição, vínculo assistencial, validação Zod, proteção contra IDOR e auditoria. Paciente pode existir sem conta; vínculo a `Patient.userId` exige verificação presencial e nunca apenas CPF/CNS.
- Somente profissional habilitado registra prioridade, confirma diagnóstico ou solicita encaminhamento. O sistema não faz classificação automática, não escolhe hospital por proximidade e não afirma integração com regulação/vagas oficiais.
- Use dados fictícios. Não publique segredos, documentos ou URLs públicas de R2. Migrations versionadas e seeds separadas; mudanças de estado e respectivos eventos/notificações devem ser atômicos.
- Interface em português brasileiro. Teste fluxos e permissões afetados, execute lint/typecheck/testes/build aplicáveis e registre resultados e limitações. Não marque conclusão sem evidência.
