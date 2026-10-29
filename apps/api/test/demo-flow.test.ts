import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { app } from '../src/index';
import type { AppEnv } from '../src/core';

const ubsNorte = '00000000-0000-4000-8000-000000000102';
const clinicaVida = '00000000-0000-4000-8000-000000000103';
const env = {
  DATABASE_URL: process.env.DATABASE_URL,
  APP_ORIGIN: 'http://localhost:5173',
  AUTH_RATE_LIMIT: { limit: async () => ({ success: true }) },
  SEARCH_RATE_LIMIT: { limit: async () => ({ success: true }) },
} as AppEnv['Bindings'];

async function call(path: string, token?: string, facilityId?: string, method = 'GET', payload?: unknown) {
  const response = await app.request(path, {
    method, headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(facilityId ? { 'X-Facility-Id': facilityId } : {}),
      ...(payload ? { 'Content-Type': 'application/json' } : {}),
    }, body: payload ? JSON.stringify(payload) : undefined,
  }, env);
  const data = await response.json() as Record<string, unknown>;
  expect(response.status, `${method} ${path}: ${JSON.stringify(data)}`).toBeLessThan(400);
  return data;
}

async function login(email: string) {
  const result = await call('/v1/auth/login', undefined, undefined, 'POST', {
    email, password: process.env.DEMO_FLOW_PASSWORD, client: 'mobile',
  });
  return result.token as string;
}

it.skipIf(process.env.SMOKE_DEMO_FLOW !== '1' || !process.env.DATABASE_URL || !process.env.DEMO_FLOW_PASSWORD)(
  'percorre posto, clínica e histórico com a mesma API e banco', async () => {
    const [flowPatient, patient, reception, doctor, clinicReception, clinicDoctor] = await Promise.all([
      login('fluxo.paciente@atende.com'), login('paciente@atende.com'),
      login('recepcao.norte@atende.com'), login('medica.ubs@atende.com'),
      login('recepcao.clinica.vida@atende.com'), login('medico.clinica@atende.com'),
    ]);
    const linked = await call('/v1/me/journey', flowPatient);
    expect((linked.patient as { fullName: string }).fullName).toBe('Paciente Fluxo Demo');
    const identity = await call('/v1/me/patient', flowPatient);
    expect(identity.cpf).toBe('98181691075');
    const facilities = (await call('/v1/facilities')).facilities as Array<{
      id: string; type: string; occupancyCapacity: number | null;
      occupancy: { active: number; status: string } | null;
    }>;
    for (const id of [ubsNorte, clinicaVida]) {
      const facility = facilities.find((item) => item.id === id);
      expect(facility?.occupancy?.active).toBeGreaterThan(0);
      expect(facility?.occupancy?.active).toBeLessThan(facility!.occupancyCapacity!);
      expect(facility?.occupancy?.status).not.toBe('FULL');
    }
    const search = (await call('/v1/patients?query=00000000000', reception, ubsNorte)).results as Array<{ id: string }>;
    expect(search).toHaveLength(1);
    const doctors = (await call(`/v1/facilities/${ubsNorte}/doctors`, reception, ubsNorte)).doctors as Array<{ id: string }>;
    expect(doctors).toHaveLength(1);
    const directIssue = await app.request('/v1/queue-tickets', { method: 'POST', headers: {
      Authorization: `Bearer ${reception}`, 'X-Facility-Id': ubsNorte, 'Content-Type': 'application/json',
    }, body: JSON.stringify({ patientId: search[0]!.id, department: 'Sem conferência de CPF', doctorId: doctors[0]!.id }) }, env);
    expect(directIssue.status).toBe(404);
    const department = `Demonstração ${randomUUID().slice(0, 8)}`;
    const checked = await call(`/v1/facilities/${ubsNorte}/check-ins`, reception, ubsNorte, 'POST', {
      cpf: '00000000000', department, doctorId: doctors[0]!.id,
    });
    const ticketId = (checked.ticket as { id: string }).id;
    const stage = async () => ((await call('/v1/me/journey', patient)).flow as { stage: string }).stage;
    expect(await stage()).toBe('WAITING_CALL');
    await call(`/v1/queue-tickets/call-next?department=${encodeURIComponent(department)}`, reception, ubsNorte, 'POST', {});
    expect(await stage()).toBe('CALLED');
    const attendance = await call(`/v1/queue-tickets/${ticketId}/triage`, doctor, ubsNorte, 'POST', { reason: 'Avaliação fictícia' });
    const attendanceId = attendance.id as string;
    expect(await stage()).toBe('SOURCE_CARE');
    const draft = { subjective: 'Avaliação inicial fictícia', objective: '', vitals: {}, painLocation: '',
      painScore: null, assessment: '', diagnosis: '', actions: ['REFERRAL'], plan: 'Avaliação especializada.',
      disposition: 'REFERRAL', followUp: '', referralFacilityId: null, referralUrgency: 'ROUTINE',
      referralReason: 'Solicitação de avaliação na clínica', referralMessage: '' };
    await call(`/v1/attendances/${attendanceId}/complete`, doctor, ubsNorte, 'POST', draft);
    expect(await stage()).toBe('WAITING_DISPATCH');
    const toSend = (await call('/v1/referrals/to-send', reception, ubsNorte)).referrals as Array<{ attendanceId: string }>;
    expect(toSend.some((item) => item.attendanceId === attendanceId)).toBe(true);
    const referral = await call(`/v1/attendances/${attendanceId}/referral`, reception, ubsNorte, 'POST', {
      targetFacilityId: clinicaVida, message: 'Encaminhamento fictício de teste',
    });
    const referralId = referral.id as string;
    expect(await stage()).toBe('CLINIC_RECEPTION');
    const inbox = (await call('/v1/referrals/incoming', clinicReception, clinicaVida)).referrals as Array<{ id: string }>;
    expect(inbox.some((item) => item.id === referralId)).toBe(true);
    const clinicDoctors = (await call(`/v1/facilities/${clinicaVida}/doctors`, clinicReception, clinicaVida)).doctors as Array<{ id: string }>;
    await call(`/v1/referrals/${referralId}/assign`, clinicReception, clinicaVida, 'POST', { doctorId: clinicDoctors[0]!.id });
    expect(await stage()).toBe('CLINIC_ASSIGNED');
    await call(`/v1/referrals/${referralId}/status`, clinicDoctor, clinicaVida, 'POST', { status: 'ACCEPTED' });
    expect(await stage()).toBe('CLINIC_ACCEPTED');
    const target = await call(`/v1/referrals/${referralId}/start`, clinicDoctor, clinicaVida, 'POST');
    expect(await stage()).toBe('CLINIC_CARE');
    await call(`/v1/attendances/${target.id}/complete`, clinicDoctor, clinicaVida, 'POST', {
      subjective: 'Avaliação especializada fictícia', objective: '', vitals: {}, painLocation: '', painScore: null,
      assessment: '', diagnosis: '', actions: ['ORIENTATION'], plan: 'Orientações finais.',
      disposition: 'DISCHARGE', followUp: '', referralFacilityId: null, referralUrgency: null,
      referralReason: '', referralMessage: '',
    });
    const finalJourney = await call('/v1/me/journey', patient);
    expect((finalJourney.flow as { stage: string }).stage).toBe('COMPLETED');
    const history = finalJourney.history as Array<{ attendanceId: string; facilityName: string }>;
    expect(history.some((item) => item.attendanceId === attendanceId)).toBe(true);
    expect(history.some((item) => item.attendanceId === target.id && item.facilityName.includes('Clínica Vida'))).toBe(true);
    const nextDispatch = (await call('/v1/referrals/to-send', clinicReception, clinicaVida)).referrals as Array<{ attendanceId: string }>;
    expect(nextDispatch.some((item) => item.attendanceId === target.id)).toBe(false);
  }, 180_000,
);
