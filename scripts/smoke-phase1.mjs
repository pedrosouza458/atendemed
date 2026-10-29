import assert from 'node:assert/strict';

const base = process.env.API_URL ?? 'http://127.0.0.1:8787';
const password = process.env.DEMO_PASSWORD;
if (!password) throw new Error('Defina DEMO_PASSWORD');
const ubs = '00000000-0000-4000-8000-000000000101';
const clinic = '00000000-0000-4000-8000-000000000103';

async function call(path, { method = 'GET', token, cookie, facility, json, browser = false } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookie) headers.Cookie = cookie;
  if (facility) headers['X-Facility-Id'] = facility;
  if (json) headers['Content-Type'] = 'application/json';
  if (browser) { headers.Origin = 'http://localhost:5173'; headers['X-Atende-Request'] = '1'; }
  const response = await fetch(`${base}${path}`, { method, headers, body: json ? JSON.stringify(json) : undefined });
  return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie') };
}

async function login(email, client = 'mobile') {
  const response = await call('/v1/auth/login', { method: 'POST', browser: client === 'web', json: { email, password, client } });
  assert.equal(response.status, 200, `login ${email}: ${response.status}`);
  return response;
}

assert.equal((await call('/v1/health')).status, 200);
const spec = await call('/v1/openapi.json');
assert.equal(spec.status, 200);
assert.ok(spec.data.paths['/v1/patients/{id}']);

const receptionist = (await login('recepcao@atende.com')).data.token;
const clinicDoctor = (await login('medico.clinica@atende.com')).data.token;
const admin = (await login('admin@atende.com')).data.token;
const web = await login('recepcao@atende.com', 'web');
const cookie = web.cookie?.split(';')[0];
assert.ok(cookie);

const stamp = Date.now().toString(36);
const fullName = `Paciente Teste ${stamp}`;
const patientInput = { fullName, birthDate: '1970-01-02' };
const csrf = await call('/v1/patients', { method: 'POST', cookie, facility: ubs, json: patientInput });
assert.equal(csrf.status, 403);

const created = await call('/v1/patients', { method: 'POST', token: receptionist, facility: ubs, json: patientInput });
assert.equal(created.status, 201, `create patient: ${created.status} ${created.data.error ?? ''}`);
const patientId = created.data.id;
assert.ok(patientId);
const read = await call(`/v1/patients/${patientId}`, { token: receptionist, facility: ubs });
assert.equal(read.status, 200);
assert.equal(read.data.fullName, fullName);

const duplicate = await call('/v1/patients', { method: 'POST', token: receptionist, facility: ubs, json: patientInput });
assert.equal(duplicate.status, 409);
assert.equal(duplicate.data.error, 'POSSIBLE_DUPLICATE');
assert.equal((await call('/v1/patients', { method: 'POST', token: receptionist, facility: ubs,
  json: { ...patientInput, confirmPossibleDuplicate: true },
})).status, 201);
assert.equal((await call(`/v1/patients/${patientId}`, { method: 'PATCH', token: receptionist, facility: ubs,
  json: { phone: '11 90000-0000' },
})).status, 200);
const search = await call(`/v1/patients?query=${encodeURIComponent(fullName)}`, { token: receptionist, facility: ubs });
assert.equal(search.status, 200);
assert.ok(search.data.results.some((patient) => patient.id === patientId));
assert.equal((await call(`/v1/patients/${patientId}`, { token: clinicDoctor, facility: clinic })).status, 404);
assert.equal((await call(`/v1/patients/${patientId}`, { token: admin, facility: ubs })).status, 403);
assert.equal((await call(`/v1/patients/${patientId}`, { token: receptionist, facility: clinic })).status, 403);
assert.equal((await call(`/v1/patients/${patientId}/link-challenges`, {
  method: 'POST', token: clinicDoctor, facility: clinic,
  json: { fullName, birthDate: patientInput.birthDate, identityVerifiedInPerson: true },
})).status, 404);
const adminMemberships = await call(`/v1/facilities/${ubs}/memberships`, { token: admin });
assert.equal(adminMemberships.status, 200);
const ownAdminMembership = adminMemberships.data.memberships.find((record) => record.userId === '00000000-0000-4000-8000-000000000201');
assert.ok(ownAdminMembership);
assert.equal((await call(`/v1/facilities/${ubs}/memberships/${ownAdminMembership.id}`, {
  method: 'PATCH', token: admin, json: { status: 'INACTIVE' },
})).status, 422);

const email = `teste.${stamp}@atende.com`;
assert.equal((await call('/v1/auth/register', { method: 'POST', json: { name: fullName, email, password } })).status, 201);
const patientToken = (await login(email)).data.token;
assert.equal((await call('/v1/me/patient', { token: patientToken })).status, 404);

const challenge = await call(`/v1/patients/${patientId}/link-challenges`, {
  method: 'POST', token: receptionist, facility: ubs,
  json: { fullName, birthDate: patientInput.birthDate, identityVerifiedInPerson: true },
});
assert.equal(challenge.status, 201, `challenge: ${challenge.status} ${challenge.data.error ?? ''}`);
assert.ok(challenge.data.code);
const linked = await call('/v1/patients/link', { method: 'POST', token: patientToken, json: { code: challenge.data.code } });
assert.equal(linked.status, 200);
assert.equal(linked.data.id, patientId);
assert.equal((await call('/v1/patients/link', { method: 'POST', token: patientToken, json: { code: challenge.data.code } })).status, 422);
assert.equal((await call('/v1/me/patient', { token: patientToken })).data.id, patientId);

assert.equal((await call('/v1/auth/logout', { method: 'POST', token: patientToken })).status, 200);
assert.equal((await call('/v1/me/patient', { token: patientToken })).status, 401);
console.log('Smoke Fase 1: health, OpenAPI, login, CSRF, paciente sem conta, duplicata, busca, isolamento institucional, vínculo verificado e logout passaram.');
