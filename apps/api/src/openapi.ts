import { z } from 'zod';
import { registerBody, loginBody, recoveryRequestBody, recoveryCompleteBody } from './domains/auth/routes';
import { patientInput, patientUpdate, challengeInput, consumeChallengeInput } from './domains/patients/schemas';
import { arrivalCheckIn, facilityInput, serviceInput, membershipInput, membershipUpdate, occupancyCapacityInput } from './domains/facilities/schemas';
import { attendanceComplete, attendanceDraft, queueDisposition, queueIssue, queuePriority, referralAssignInput, referralDispatchInput, referralStatusInput, triageInput } from './domains/queue/schemas';

const request = (name: string) => ({ required: true, content: { 'application/json': { schema: { $ref: `#/components/schemas/${name}` } } } });
const success = (description: string, status: 200 | 201 | 202) => ({ [status]: { description }, '400': { description: 'Dados inválidos' }, '401': { description: 'Autenticação necessária' }, '403': { description: 'Sem permissão' } });
const operation = (summary: string, method: 'get' | 'post' | 'put' | 'patch', schema?: string, extra?: object, status: 200 | 201 | 202 = 200) => ({
  [method]: { summary, ...(schema ? { requestBody: request(schema) } : {}), responses: success(summary, status), ...extra },
});
const facilityParameter = { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
const patientParameter = facilityParameter;
const auth = [{ bearerAuth: [] }, { cookieAuth: [] }];

export const openapiSpec = {
  openapi: '3.1.0',
  info: { title: 'Atende API', version: '0.1.0', description: 'API demonstrativa com dados fictícios. Não substitui sistemas oficiais de saúde.' },
  paths: {
    '/v1/health': operation('Saúde da API', 'get'),
    '/v1/auth/register': operation('Criar conta sem vínculo clínico', 'post', 'Register', undefined, 201),
    '/v1/auth/login': operation('Iniciar sessão', 'post', 'Login'),
    '/v1/auth/me': operation('Conta e vínculos ativos', 'get', undefined, { security: auth }),
    '/v1/auth/logout': operation('Revogar sessão', 'post', undefined, { security: auth }),
    '/v1/auth/recovery/request': operation('Solicitar recuperação', 'post', 'RecoveryRequest', undefined, 202),
    '/v1/auth/recovery/complete': operation('Concluir recuperação', 'post', 'RecoveryComplete'),
    '/v1/patients': {
      ...operation('Buscar pacientes', 'get', undefined, { security: auth, parameters: [
        { name: 'query', in: 'query', required: true, schema: { type: 'string', minLength: 3 } },
        { name: 'X-Facility-Id', in: 'header', required: true, schema: { type: 'string', format: 'uuid' } },
      ] }),
      ...operation('Cadastrar paciente sem conta', 'post', 'PatientInput', { security: auth }, 201),
    },
    '/v1/patients/{id}': {
      ...operation('Dados administrativos do paciente', 'get', undefined, { security: auth, parameters: [patientParameter] }),
      ...operation('Atualizar dados administrativos', 'patch', 'PatientUpdate', { security: auth, parameters: [patientParameter] }),
    },
    '/v1/patients/{id}/link-challenges': operation('Emitir código após verificação presencial', 'post', 'ChallengeInput', { security: auth, parameters: [patientParameter] }, 201),
    '/v1/patients/link': operation('Vincular conta ao paciente', 'post', 'ConsumeChallenge', { security: auth }),
    '/v1/me/patient': operation('Dados do próprio paciente vinculado', 'get', undefined, { security: auth }),
    '/v1/me/journey': operation('Jornada e prontuário do paciente vinculado', 'get', undefined, { security: auth }),
    '/v1/me/reports': {
      ...operation('Listar laudos enviados pelo paciente', 'get', undefined, { security: auth }),
      ...operation('Enviar laudo em PDF ou imagem', 'post', undefined, { security: auth, requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', required: ['title', 'file'], properties: { title: { type: 'string' }, description: { type: 'string' }, file: { type: 'string', format: 'binary' } } } } } } }, 201),
    },
    '/v1/me/reports/{id}': operation('Baixar laudo próprio', 'get', undefined, { security: auth, parameters: [patientParameter] }),
    '/v1/me/notifications': operation('Listar notificações da própria conta', 'get', undefined, { security: auth }),
    '/v1/facilities': {
      ...operation('Listar unidades fictícias', 'get'),
      ...operation('Criar unidade', 'post', 'FacilityInput', { security: auth }, 201),
    },
    '/v1/facilities/{id}': operation('Detalhes, serviços e horários', 'get', undefined, { parameters: [facilityParameter] }),
    '/v1/facilities/{id}/doctors': operation('Listar médicos habilitados da unidade para atribuição da recepção', 'get', undefined, { security: auth, parameters: [facilityParameter] }),
    '/v1/facilities/{id}/occupancy': operation('Consultar lotação pública atual de UBS ou UPA', 'get', undefined, { parameters: [facilityParameter] }),
    '/v1/facilities/{id}/occupancy-capacity': operation('Atualizar capacidade de referência da lotação', 'patch', 'OccupancyCapacityInput', { security: auth, parameters: [facilityParameter] }),
    '/v1/facilities/{id}/arrivals': operation('Listar chegadas ativas da unidade', 'get', undefined, { security: auth, parameters: [facilityParameter] }),
    '/v1/facilities/{id}/check-ins': operation('Registrar chegada, atualizar lotação e emitir uma única senha', 'post', 'ArrivalCheckIn', { security: auth, parameters: [facilityParameter] }, 201),
    '/v1/facilities/{id}/arrivals/{arrivalId}/close': operation('Encerrar chegada quando a pessoa sair', 'post', undefined, { security: auth, parameters: [facilityParameter, { name: 'arrivalId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }] }),
    '/v1/facilities/{id}/services': operation('Cadastrar serviço da unidade', 'post', 'ServiceInput', { security: auth, parameters: [facilityParameter] }, 201),
    '/v1/facilities/{id}/memberships': {
      ...operation('Listar vínculos da unidade', 'get', undefined, { security: auth, parameters: [facilityParameter] }),
      ...operation('Vincular profissional existente', 'post', 'MembershipInput', { security: auth, parameters: [facilityParameter] }, 201),
    },
    '/v1/facilities/{id}/memberships/{membershipId}': operation('Ativar ou desativar vínculo', 'patch', 'MembershipUpdate', { security: auth, parameters: [facilityParameter, { name: 'membershipId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }] }),
    '/v1/queue-tickets': {
      ...operation('Consultar fila da unidade', 'get', undefined, { security: auth, parameters: [{ name: 'X-Facility-Id', in: 'header', required: true, schema: { type: 'string', format: 'uuid' } }, { name: 'department', in: 'query', required: false, schema: { type: 'string' } }] }),
      ...operation('Emitir senha', 'post', 'QueueIssue', { security: auth }, 201),
    },
    '/v1/queue-tickets/call-next': operation('Chamar próxima senha', 'post', undefined, { security: auth, parameters: [{ name: 'X-Facility-Id', in: 'header', required: true, schema: { type: 'string', format: 'uuid' } }, { name: 'department', in: 'query', required: false, schema: { type: 'string' } }] }),
    '/v1/queue-tickets/{id}/disposition': operation('Cancelar ou registrar ausência', 'post', 'QueueDisposition', { security: auth, parameters: [patientParameter] }),
    '/v1/queue-tickets/{id}/priority': operation('Profissional define prioridade clínica humana', 'post', 'QueuePriority', { security: auth, parameters: [patientParameter] }),
    '/v1/queue-tickets/{id}/triage': operation('Iniciar atendimento e registrar acolhimento', 'post', 'Triage', { security: auth, parameters: [patientParameter] }, 201),
    '/v1/attendances/{id}': operation('Consultar atendimento e histórico permitido', 'get', undefined, { security: auth, parameters: [patientParameter] }),
    '/v1/attendances/{id}/draft': operation('Salvar rascunho do atendimento', 'put', 'AttendanceDraft', { security: auth, parameters: [patientParameter] }),
    '/v1/attendances/{id}/complete': operation('Registrar evolução e concluir atendimento', 'post', 'AttendanceComplete', { security: auth, parameters: [patientParameter] }),
    '/v1/attendances/{id}/referral': operation('Enviar encaminhamento indicado pelo médico', 'post', 'ReferralDispatch', { security: auth, parameters: [patientParameter] }, 201),
    '/v1/attendances/{id}/documents': {
      ...operation('Listar PDFs do atendimento', 'get', undefined, { security: auth, parameters: [patientParameter] }),
      ...operation('Anexar PDF ao atendimento', 'post', undefined, { security: auth, parameters: [patientParameter] }, 201),
    },
    '/v1/attendance-documents/{id}': operation('Baixar PDF de atendimento autorizado', 'get', undefined, { security: auth, parameters: [patientParameter] }),
    '/v1/referrals/to-send': operation('Listar indicações médicas aguardando envio pela recepção', 'get', undefined, { security: auth, parameters: [patientParameter] }),
    '/v1/referrals/incoming': operation('Listar encaminhamentos recebidos', 'get', undefined, { security: auth, parameters: [patientParameter] }),
    '/v1/referrals/{id}': operation('Consultar encaminhamento e registro associado', 'get', undefined, { security: auth, parameters: [patientParameter] }),
    '/v1/referrals/{id}/status': operation('Receber ou recusar encaminhamento', 'post', 'ReferralStatus', { security: auth, parameters: [patientParameter] }),
    '/v1/referrals/{id}/start': operation('Iniciar ou retomar atendimento de encaminhamento sem emitir senha', 'post', undefined, { security: auth, parameters: [patientParameter], responses: { ...success('Novo atendimento iniciado', 201), 200: { description: 'Atendimento em andamento retomado' } } }, 201),
    '/v1/referrals/{id}/assign': operation('Atribuir encaminhamento a médico da unidade', 'post', 'ReferralAssign', { security: auth, parameters: [patientParameter] }),
    '/v1/me/notifications/{id}/read': operation('Marcar notificação como lida', 'post', undefined, { security: auth, parameters: [patientParameter] }),
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer' },
      cookieAuth: { type: 'apiKey', in: 'cookie', name: 'atende_session' },
    },
    schemas: Object.fromEntries(Object.entries({
      Register: registerBody, Login: loginBody, RecoveryRequest: recoveryRequestBody, RecoveryComplete: recoveryCompleteBody,
      PatientInput: patientInput, PatientUpdate: patientUpdate, ChallengeInput: challengeInput, ArrivalCheckIn: arrivalCheckIn,
      ConsumeChallenge: consumeChallengeInput, FacilityInput: facilityInput, ServiceInput: serviceInput, MembershipInput: membershipInput, MembershipUpdate: membershipUpdate, OccupancyCapacityInput: occupancyCapacityInput,
      QueueIssue: queueIssue, QueueDisposition: queueDisposition, Triage: triageInput, AttendanceDraft: attendanceDraft, AttendanceComplete: attendanceComplete, ReferralStatus: referralStatusInput, ReferralAssign: referralAssignInput, ReferralDispatch: referralDispatchInput,
      QueuePriority: queuePriority,
    }).map(([name, schema]) => [name, z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' })])),
  },
};
