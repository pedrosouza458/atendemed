# Atende — produto e escopo do MVP

**Status:** escopo revisado em 23/10/2026 conforme o fluxo esperado; consulte `docs/PLAN.md` para o progresso de implementação.

## Visão

**Atende — A conexão que cuida.** Plataforma demonstrativa de Saúde Conectada para acompanhar a jornada entre UBS, UPA, clínicas, hospitais, centros de diagnóstico e pacientes. UBS e UPA têm operações distintas: a UBS atende consultas e cuidados regulares; a UPA atende demanda urgente com prioridade definida por profissional. O paciente pode acompanhar informações e notificações de status. O hospital não usa código de chegada/lotação.

O produto **não** substitui e-SUS APS, regulação oficial, protocolos clínicos ou decisões de profissionais. Estabelecimentos, pacientes, vagas, agendas e documentos da demonstração serão fictícios. Não exibir disponibilidade ou tempo de espera como dado real.

## Pessoas e permissões

| Perfil | Objetivo no MVP | Limite essencial |
| --- | --- | --- |
| Paciente com conta | Ver a própria jornada, senha, documentos e notificações; compartilhar documentos selecionados | A conta só acessa `Patient` após vínculo de identidade verificado. Atendimento presencial independe de conta. |
| Atendente | Cadastrar paciente sem conta, corrigir dados administrativos, emitir/chamar senha e anexar documento informado | Não classifica risco, confirma diagnóstico nem consulta prontuário clínico completo. |
| Médico | Acolher/classificar dentro da competência demonstrada, atender, registrar achados, solicitar serviço, revisar documento e devolver plano | Atua apenas em instituição à qual possui vínculo ativo; acesso clínico exige contexto assistencial. |
| Administrador | Gerir instituições, serviços, profissionais e vínculos | Não recebe acesso clínico por ser administrador. |

O modelo de vínculos permite papéis futuros, como enfermagem, com permissões próprias. Um profissional pode atuar em várias instituições com papéis diferentes.

## Capacidades funcionais

1. **Cadastro e busca:** pesquisa por nome, CPF ou CNS; cadastro presencial sem `User`; sinalização de possível duplicidade antes de salvar; edição administrativa com trilha de auditoria. CPF/CNS são identificadores de busca, não prova de identidade. O vínculo posterior a uma conta exige conferência presencial por profissional autorizado e código de uso único com validade curta. Esse código de vínculo é diferente da senha de atendimento.
2. **Operação da UBS e da UPA:** UBS mantém consultas agendadas e atendimento regular. UPA recebe demanda urgente e usa fila própria, com prioridade definida por profissional durante o acolhimento; o sistema não classifica risco automaticamente. Os fluxos não compartilham a mesma fila ou regra de prioridade.
3. **Chegada, fila e lotação:** a recepção localiza o paciente pelo CPF, inclusive quando o cadastro foi criado em outro posto, escolhe setor e médico habilitado e cria um único código de atendimento que pode ser impresso. Em UBS e UPA, essa mesma confirmação também registra a chegada para atualizar a lotação e pode notificar a conta vinculada com o mesmo código. Clínicas, hospitais e centros de diagnóstico emitem código/fila pela recepção, mas não registram chegada para lotação. A clínica mostra um indicador agregado das pessoas aguardando ou em atendimento na sua fila, com capacidade de referência. O código serve para a fila da recepção; encaminhamentos recebidos e aceitos por médicos entram na fila de trabalho do médico sem senha/código. O código não reserva vaga, não valida encaminhamento/agendamento nem comprova identidade. O mapa do app mostra lotação agregada para UBS e UPA; durante o encaminhamento, a jornada também mostra a ocupação da clínica de destino. Não há previsão de espera nem dados de outras pessoas. Na UPA, a informação não deve sugerir que uma urgência seja adiada ou redirecionada.
4. **Atendimento:** médico acessa o histórico permitido, registra anamnese, evolução, diagnósticos/hipóteses, condutas, orientações, exames e anexa PDFs à ficha, inclusive durante a triagem da UPA. Ao encaminhar, os sinais vitais registrados na triagem seguem no resumo recebido pelo próximo médico. Pode concluir o atendimento sem encaminhar. Uma pessoa pode ter vários atendimentos em unidades diferentes.
5. **Histórico longitudinal:** eventos clínicos em ordem cronológica com origem, data, unidade, profissional e atendimento associados; correções preservam a versão anterior. Distingue informação autodeclarada, documento revisado e diagnóstico confirmado clinicamente.
6. **Encaminhamento entre unidades:** o médico registra no atendimento a indicação clínica, prioridade e desfecho de encaminhamento, e salva a consulta sem escolher o destino ou enviar o pedido. A indicação volta à caixa de saída da recepção da mesma unidade do médico, mesmo quando a ficha não tem código de fila. A recepção escolhe a unidade parceira (com seus serviços/especialidades) e envia o encaminhamento; uma observação administrativa pode acompanhar o pedido. Só então a recepção de destino recebe o resumo operacional e atribui um médico habilitado. O médico atribuído recebe uma notificação interna clicável com nome do paciente e prioridade; ao abrir, acessa os dados cadastrais e somente o prontuário daquele atendimento encaminhado, incluindo sinais vitais encaminhados. O histórico de consultas anteriores não é compartilhado. A recepção de destino não abre a ficha clínica. O acesso clínico do médico exige vínculo ativo no destino e é auditado. Não há sugestão automática de parceiro nem integração externa neste fluxo.
7. **Contrarreferência e alta:** o destino registra resumo, achados, conduta, exames, orientações, acompanhamento e próximas ações. A origem recebe notificação e uma pendência quando houver acompanhamento. No hospital, o médico pode registrar internação simplificada e resumo de alta.
8. **Documentos:** PDFs anexados à ficha de qualquer atendimento médico ficam em R2 privado e ligados à pessoa, unidade, autor e atendimento; o download valida vínculo médico/unidade e é auditado. Compartilhamento pelo paciente usa seleção explícita, prazo, revogação e proteção de acesso. Nenhuma verificação documental oficial será simulada como real.
9. **Paciente mobile:** autenticação e recuperação, início, lista de unidades fictícias com filtros, horários cadastrados e indicador de lotação atualizado para UBS e UPA, jornada, carteira, compartilhamento e perfil. O app apresenta a senha e a etapa da jornada, da chamada no posto à conclusão na clínica, com atualização periódica enquanto está aberto. A unidade também pode imprimir a senha. A conta sem vínculo não revela dados clínicos.
10. **Notificações:** avisos internos de status (por exemplo, encaminhamento, agendamento e retorno à UBS). Não há conversa/chat entre paciente e unidade nem integração de push no MVP.

## Quatro demonstrações obrigatórias

| Fluxo | Sequência observável | Evidência de conclusão |
| --- | --- | --- |
| Fluxo A — UBS regular | Paciente agenda ou chega para atendimento regular → recepção localiza o paciente pelo CPF, escolhe setor e médico habilitado → confirma uma vez → sistema registra lotação e emite uma senha atribuída ao médico na mesma transação → a mesma senha vai para a conta vinculada se existir e pode ser impressa → médico atende e pode concluir sem encaminhar | Agenda/fila da UBS atualizada; senha visível ao médico atribuído; indicador de lotação reflete chegadas ativas. |
| Fluxo B — UPA | Paciente chega à UPA → recepção localiza o paciente pelo CPF, escolhe setor e médico habilitado → confirma uma vez → sistema registra lotação e emite uma senha atribuída ao médico na mesma transação → a mesma senha vai para a conta vinculada se existir e pode ser impressa → profissional faz acolhimento, define prioridade e conduz a fila própria da UPA | Ocupação da UPA atualizada; senha visível ao médico atribuído; prioridade tem autor profissional; senha não substitui avaliação clínica. |
| Fluxo C — UBS → clínica | Recepção do posto localiza CPF e emite/chama senha → médico atende e indica encaminhamento → recepção envia à clínica → recepção da clínica atribui médico → especialista atende e conclui sem novo encaminhamento | Paciente acompanha cada etapa no app e vê os registros dos dois atendimentos no histórico. O retorno de plano à UBS é uma evolução posterior. |
| Fluxo D — UBS → hospital → UBS | Médico solicita serviço hospitalar → hospital recebe e atende → registra internação quando aplicável e alta → devolve orientações | Histórico e status atualizados; UBS vê orientações e pendências; hospital não emite código de lotação e nenhuma vaga oficial é anunciada. |

## Experiência e linguagem

Web: uma aplicação React com layout comum, módulos conforme tipo de unidade e permissões. Mobile: ações diretas, texto legível e alvos de toque generosos, considerando pessoas idosas. Tudo em português brasileiro e acessível por teclado/leitor de tela quando aplicável. **Decisão de identidade:** o nome oficial é *Atende* (as grafias “Atendi” e “Damed” no pedido são tratadas como lapsos); verde é a cor primária do produto, roxo/lavanda é secundária, coral destaca ações pontuais, branco/cinza-claro formam a base. Cores semânticas não devem ser o único sinal de status.

## Critério de sucesso do MVP

Com a **mesma API e o mesmo banco**, a equipe deve operar UBS regular e UPA em filas separadas, registrar chegada e lotação nas unidades participantes, concluir atendimento simples e fechar encaminhamento de clínica/hospital com retorno à UBS. O paciente recebe notificações de status e pode consultar a lotação; vínculo verificado continua necessário para ver dados clínicos. Todos os fluxos usam dados fictícios e persistidos; reiniciar as aplicações não apaga o estado.

## Fora do escopo desta demonstração

Regulação e disponibilidade oficial, integração com RNDS/portabilidade de dados (dependência futura, fora do MVP), integração com e-SUS APS, classificação de risco automática, prontuário hospitalar completo, código de lotação para clínicas, hospitais e centros de diagnóstico, assinatura/verificação documental oficial, telemedicina, cobrança/faturamento, integração com laboratórios reais, chat com pacientes, push e uso com pacientes reais. Uma implantação assistencial exigiria avaliações clínicas, jurídicas, de privacidade, segurança e operação adicionais.
