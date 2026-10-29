import { config } from 'dotenv';
import { Pool } from 'pg';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { hashPassword } from '@atende/shared';
import { authCredentials, doctors, facilityArrivals, facilityServices, healthcareFacilities, patients, queueTickets, receptionists, staffMemberships, users } from './schema';

config({ path: '../../.env', quiet: true });
config({ path: '../../.dev.vars', quiet: true });

if (process.env.DEMO_SEED !== '1' || process.env.NODE_ENV === 'production') throw new Error('Seed demonstrativa exige DEMO_SEED=1 fora de produção');
if (!process.env.DATABASE_URL || !process.env.DEMO_PASSWORD || process.env.DEMO_PASSWORD.length < 12) throw new Error('Configure DATABASE_URL e DEMO_PASSWORD com pelo menos 12 caracteres');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle({ client: pool });
const passwordHash = await hashPassword(process.env.DEMO_PASSWORD);
const ids = {
  ubsCentro: '00000000-0000-4000-8000-000000000101',
  ubsNorte: '00000000-0000-4000-8000-000000000102',
  upaCentro: '00000000-0000-4000-8000-000000000107',
  clinicaVida: '00000000-0000-4000-8000-000000000103',
  clinicaSul: '00000000-0000-4000-8000-000000000104',
  hospital: '00000000-0000-4000-8000-000000000105',
  diagnostico: '00000000-0000-4000-8000-000000000106',
  admin: '00000000-0000-4000-8000-000000000201',
  recepcao: '00000000-0000-4000-8000-000000000202',
  medicoUbs: '00000000-0000-4000-8000-000000000203',
  medicoClinica: '00000000-0000-4000-8000-000000000204',
  pacienteConta: '00000000-0000-4000-8000-000000000205',
  pacienteFluxoConta: '00000000-0000-4000-8000-000000000213',
  recepcaoNorte: '00000000-0000-4000-8000-000000000214',
  pacienteNovoConta: '00000000-0000-4000-8000-000000000215',
  enfermeiroUbs: '00000000-0000-4000-8000-000000000216',
  anaConta: '00000000-0000-4000-8000-000000000217',
  medicoDiagnostico: '00000000-0000-4000-8000-000000000206',
  recepcaoUpa: '00000000-0000-4000-8000-000000000208',
  recepcaoClinicaVida: '00000000-0000-4000-8000-000000000209',
  recepcaoClinicaSul: '00000000-0000-4000-8000-000000000210',
  recepcaoHospital: '00000000-0000-4000-8000-000000000211',
  recepcaoDiagnostico: '00000000-0000-4000-8000-000000000212',
  pacienteVinculado: '00000000-0000-4000-8000-000000000301',
  pacienteSemConta: '00000000-0000-4000-8000-000000000302',
  pacienteFluxo: '00000000-0000-4000-8000-000000000323',
  pacienteNovo: '00000000-0000-4000-8000-000000000324',
  pacienteAna: '00000000-0000-4000-8000-000000000325',
};

const facilities = [
  { id: ids.ubsCentro, name: 'UBS Centro (fictícia)', type: 'UBS' as const, cnes: 'DEMO0001', address: 'Rua Exemplo, 100 — Centro', occupancyCapacity: 40, latitude: -23.5505, longitude: -46.6333 },
  { id: ids.ubsNorte, name: 'UBS Norte (fictícia)', type: 'UBS' as const, cnes: 'DEMO0002', address: 'Rua Exemplo, 200 — Norte', occupancyCapacity: 30, latitude: -23.5578, longitude: -46.6488 },
  { id: ids.clinicaVida, name: 'Clínica Vida (fictícia)', type: 'CLINIC' as const, cnes: 'DEMO0003', address: 'Rua Exemplo, 300 — Leste', occupancyCapacity: 20 },
  { id: ids.clinicaSul, name: 'Clínica Sul (fictícia)', type: 'CLINIC' as const, cnes: 'DEMO0004', address: 'Rua Exemplo, 400 — Sul', occupancyCapacity: 20 },
  { id: ids.hospital, name: 'Hospital Demo (fictício)', type: 'HOSPITAL' as const, cnes: 'DEMO0005', address: 'Rua Exemplo, 500 — Oeste' },
  { id: ids.diagnostico, name: 'Centro de Diagnóstico (fictício)', type: 'DIAGNOSTIC_CENTER' as const, cnes: 'DEMO0006', address: 'Rua Exemplo, 600 — Centro' },
  { id: ids.upaCentro, name: 'UPA Centro (fictícia)', type: 'UPA' as const, cnes: 'DEMO0007', address: 'Rua Exemplo, 700 — Centro', occupancyCapacity: 80, latitude: -23.5433, longitude: -46.6389 },
];
for (const facility of facilities) await db.insert(healthcareFacilities).values({ ...facility, ownershipType: 'DEMO', susParticipation: false })
  .onConflictDoUpdate({ target: healthcareFacilities.id, set: { occupancyCapacity: facility.occupancyCapacity ?? null, latitude: facility.latitude ?? null, longitude: facility.longitude ?? null } });

for (const [facilityId, code, name] of [
  [ids.ubsCentro, 'PRIMARY_CARE', 'Atenção primária'], [ids.ubsNorte, 'PRIMARY_CARE', 'Atenção primária'],
  [ids.ubsCentro, 'GENERAL_CARE', 'Atendimento geral'], [ids.ubsNorte, 'GENERAL_CARE', 'Atendimento geral'],
  [ids.upaCentro, 'URGENT_CARE', 'Atendimento de urgência'],
  [ids.clinicaVida, 'CARDIOLOGY', 'Cardiologia'], [ids.clinicaVida, 'DENTISTRY', 'Odontologia'], [ids.clinicaVida, 'IMAGING', 'Tomografia'],
  [ids.clinicaSul, 'DERMATOLOGY', 'Dermatologia'], [ids.clinicaSul, 'ONCOLOGY', 'Oncologia'],
  [ids.hospital, 'HOSPITAL_CARE', 'Atendimento hospitalar'], [ids.hospital, 'ONCOLOGY', 'Oncologia'], [ids.diagnostico, 'IMAGING', 'Diagnóstico por imagem'], [ids.diagnostico, 'TOMOGRAPHY', 'Tomografia'],
] as const) await db.insert(facilityServices).values({ facilityId, code, name }).onConflictDoNothing();

const accounts = [
  { id: ids.admin, name: 'Admin Demo', email: 'admin@atende.com', isSystemAdmin: true },
  { id: ids.recepcao, name: 'Recepção Demo', email: 'recepcao@atende.com', isSystemAdmin: false },
  { id: ids.medicoUbs, name: 'Médica UBS Demo', email: 'medica.ubs@atende.com', isSystemAdmin: false },
  { id: ids.medicoClinica, name: 'Médico Clínica Demo', email: 'medico.clinica@atende.com', isSystemAdmin: false },
  { id: ids.medicoDiagnostico, name: 'Médico Diagnóstico Demo', email: 'medico.diagnostico@atende.com', isSystemAdmin: false },
  { id: ids.recepcaoUpa, name: 'Recepção UPA Demo', email: 'recepcao.upa@atende.com', isSystemAdmin: false },
  { id: ids.recepcaoClinicaVida, name: 'Recepção Clínica Vida Demo', email: 'recepcao.clinica.vida@atende.com', isSystemAdmin: false },
  { id: ids.recepcaoClinicaSul, name: 'Recepção Clínica Sul Demo', email: 'recepcao.clinica.sul@atende.com', isSystemAdmin: false },
  { id: ids.recepcaoHospital, name: 'Recepção Hospital Demo', email: 'recepcao.hospital@atende.com', isSystemAdmin: false },
  { id: ids.recepcaoDiagnostico, name: 'Recepção Diagnóstico Demo', email: 'recepcao.diagnostico@atende.com', isSystemAdmin: false },
  { id: ids.pacienteConta, name: 'Paciente Demo', email: 'paciente@atende.com', isSystemAdmin: false },
  { id: ids.pacienteFluxoConta, name: 'Paciente Fluxo Demo', email: 'fluxo.paciente@atende.com', isSystemAdmin: false },
  { id: ids.pacienteNovoConta, name: 'Paciente Novo Demo', email: 'paciente.novo@atende.com', isSystemAdmin: false },
  { id: ids.enfermeiroUbs, name: 'Enfermeiro UBS Demo', email: 'enfermeiro.ubs@atende.com', isSystemAdmin: false },
  { id: ids.recepcaoNorte, name: 'Recepção UBS Norte Demo', email: 'recepcao.norte@atende.com', isSystemAdmin: false },
  { id: ids.anaConta, name: 'Ana Demo', email: 'ana@atende.com', isSystemAdmin: false },
];
const flowPasswordHash = process.env.DEMO_FLOW_PASSWORD ? await hashPassword(process.env.DEMO_FLOW_PASSWORD) : passwordHash;
for (const account of accounts) {
  await db.insert(users).values(account).onConflictDoUpdate({ target: users.id, set: { name: account.name, email: account.email, isSystemAdmin: account.isSystemAdmin } });
  await db.insert(authCredentials).values({ userId: account.id, passwordHash: [ids.pacienteFluxoConta, ids.pacienteNovoConta, ids.enfermeiroUbs, ids.recepcaoNorte, ids.anaConta].includes(account.id) ? flowPasswordHash : passwordHash }).onConflictDoNothing();
}

await db.insert(doctors).values([
  { userId: ids.medicoUbs, crm: 'DEMO-100', crmState: 'SP', specialties: ['Clínica geral'], verificationStatus: 'VERIFIED' },
  { userId: ids.enfermeiroUbs, crm: 'DEMO-ENF-400', crmState: 'SP', specialties: ['Enfermagem'], verificationStatus: 'VERIFIED' },
  { userId: ids.medicoClinica, crm: 'DEMO-200', crmState: 'SP', specialties: ['Cardiologia'], verificationStatus: 'VERIFIED' },
  { userId: ids.medicoDiagnostico, crm: 'DEMO-300', crmState: 'SP', specialties: ['Radiologia'], verificationStatus: 'VERIFIED' },
]).onConflictDoNothing();
await db.insert(receptionists).values([
  { userId: ids.recepcao, employeeCode: 'DEMO-REC-UBS' },
  { userId: ids.recepcaoUpa, employeeCode: 'DEMO-REC-UPA' },
  { userId: ids.recepcaoClinicaVida, employeeCode: 'DEMO-REC-CLINICA-VIDA' },
  { userId: ids.recepcaoClinicaSul, employeeCode: 'DEMO-REC-CLINICA-SUL' },
  { userId: ids.recepcaoHospital, employeeCode: 'DEMO-REC-HOSPITAL' },
  { userId: ids.recepcaoDiagnostico, employeeCode: 'DEMO-REC-DIAGNOSTICO' },
  { userId: ids.recepcaoNorte, employeeCode: 'DEMO-REC-UBS-NORTE' },
]).onConflictDoNothing();
await db.insert(staffMemberships).values([
  { userId: ids.admin, facilityId: ids.ubsCentro, role: 'ADMIN' },
  { userId: ids.recepcao, facilityId: ids.ubsCentro, role: 'RECEPTIONIST' },
  { userId: ids.medicoUbs, facilityId: ids.ubsCentro, role: 'DOCTOR' },
  { userId: ids.recepcaoNorte, facilityId: ids.ubsNorte, role: 'RECEPTIONIST' },
  { userId: ids.medicoUbs, facilityId: ids.ubsNorte, role: 'DOCTOR' },
  { userId: ids.enfermeiroUbs, facilityId: ids.ubsCentro, role: 'DOCTOR' },
  { userId: ids.enfermeiroUbs, facilityId: ids.ubsNorte, role: 'DOCTOR' },
  { userId: ids.recepcaoUpa, facilityId: ids.upaCentro, role: 'RECEPTIONIST' },
  { userId: ids.medicoUbs, facilityId: ids.upaCentro, role: 'DOCTOR' },
  { userId: ids.medicoClinica, facilityId: ids.clinicaVida, role: 'DOCTOR' },
  { userId: ids.recepcaoClinicaVida, facilityId: ids.clinicaVida, role: 'RECEPTIONIST' },
  { userId: ids.recepcaoClinicaSul, facilityId: ids.clinicaSul, role: 'RECEPTIONIST' },
  { userId: ids.medicoClinica, facilityId: ids.clinicaSul, role: 'DOCTOR' },
  { userId: ids.recepcaoHospital, facilityId: ids.hospital, role: 'RECEPTIONIST' },
  { userId: ids.medicoClinica, facilityId: ids.hospital, role: 'DOCTOR' },
  { userId: ids.recepcaoDiagnostico, facilityId: ids.diagnostico, role: 'RECEPTIONIST' },
  { userId: ids.medicoDiagnostico, facilityId: ids.diagnostico, role: 'DOCTOR' },
]).onConflictDoNothing();
await db.update(staffMemberships).set({ status: 'INACTIVE', updatedAt: new Date() }).where(and(
  eq(staffMemberships.userId, ids.recepcao), eq(staffMemberships.role, 'RECEPTIONIST'),
  inArray(staffMemberships.facilityId, [ids.upaCentro, ids.clinicaVida, ids.clinicaSul, ids.hospital, ids.diagnostico]),
));
await db.insert(patients).values([
  { id: ids.pacienteVinculado, userId: ids.pacienteConta, registeredFacilityId: ids.ubsCentro, fullName: 'Paciente Demo', searchName: 'paciente demo', cpf: '00000000000', birthDate: '1980-01-01' },
  { id: ids.pacienteSemConta, registeredFacilityId: ids.ubsCentro, fullName: 'Pessoa Sem Conta Demo', searchName: 'pessoa sem conta demo', cpf: '00000000001', birthDate: '1975-05-20' },
  { id: ids.pacienteFluxo, userId: ids.pacienteFluxoConta, registeredFacilityId: ids.ubsCentro, fullName: 'Paciente Fluxo Demo', searchName: 'paciente fluxo demo', cpf: '98181691075', birthDate: '1990-05-15' },
  { id: ids.pacienteNovo, userId: ids.pacienteNovoConta, registeredFacilityId: ids.ubsCentro, fullName: 'Paciente Novo Demo', searchName: 'paciente novo demo', cpf: '73829160496', birthDate: '1994-04-03' },
  { id: ids.pacienteAna, userId: ids.anaConta, registeredFacilityId: ids.ubsCentro, fullName: 'Ana Demo', searchName: 'ana demo', cpf: '92415252077', birthDate: '1995-08-11' },
  ...[
    ['Maria Aparecida da Silva', '1987-03-12'], ['José Carlos dos Santos', '1974-08-25'],
    ['Ana Paula Oliveira', '1992-01-09'], ['João Pedro Souza', '2001-06-14'],
    ['Francisca Maria Costa', '1968-11-03'], ['Antônio José Pereira', '1959-04-22'],
    ['Juliana Ferreira Lima', '1995-09-17'], ['Marcos Vinícius Rodrigues', '1983-02-06'],
    ['Patrícia Gomes Almeida', '1979-12-28'], ['Lucas Martins Ribeiro', '2005-05-30'],
    ['Beatriz Carvalho Alves', '2011-07-19'], ['Raimundo Nonato Nunes', '1962-10-11'],
    ['Camila Barbosa Araújo', '1998-04-02'], ['Pedro Henrique Cardoso', '1989-01-26'],
    ['Sandra Regina Teixeira', '1970-06-08'], ['Gabriel Mendes Rocha', '2015-03-21'],
    ['Márcia Aparecida Moreira', '1980-08-16'], ['Rafael Gonçalves Dias', '1993-11-05'],
    ['Fernanda Ribeiro Castro', '2008-02-13'], ['Paulo Roberto Ferreira', '1955-12-01'],
  ].map(([fullName, birthDate], index) => ({
    id: `00000000-0000-4000-8000-${String(index + 303).padStart(12, '0')}`,
    registeredFacilityId: ids.ubsCentro,
    fullName: fullName!,
    searchName: fullName!.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR'),
    birthDate: birthDate!,
  })),
]).onConflictDoUpdate({ target: patients.id, set: { cpf: sql`excluded.cpf` } });

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
for (const [facilityId, patientNumber, code, createdBy] of [
  [ids.ubsCentro, 303, 'D01', ids.recepcao], [ids.ubsCentro, 304, 'D02', ids.recepcao],
  [ids.ubsCentro, 305, 'D03', ids.recepcao], [ids.ubsCentro, 306, 'D04', ids.recepcao],
  [ids.ubsNorte, 307, 'D01', ids.recepcao], [ids.ubsNorte, 308, 'D02', ids.recepcao],
  [ids.upaCentro, 309, 'D01', ids.recepcaoUpa], [ids.upaCentro, 310, 'D02', ids.recepcaoUpa],
  [ids.upaCentro, 311, 'D03', ids.recepcaoUpa],
] as const) await db.insert(facilityArrivals).values({
  facilityId, patientId: `00000000-0000-4000-8000-${String(patientNumber).padStart(12, '0')}`,
  arrivalDate: today, code, createdBy,
}).onConflictDoNothing({ target: [facilityArrivals.facilityId, facilityArrivals.arrivalDate, facilityArrivals.code] });

for (const [facilityId, patientNumber, code, createdBy] of [
  [ids.clinicaVida, 312, '901', ids.recepcaoClinicaVida],
  [ids.clinicaVida, 313, '902', ids.recepcaoClinicaVida],
  [ids.clinicaVida, 314, '903', ids.recepcaoClinicaVida],
  [ids.clinicaSul, 315, '901', ids.recepcaoClinicaSul],
  [ids.clinicaSul, 316, '902', ids.recepcaoClinicaSul],
] as const) await db.insert(queueTickets).values({
  facilityId, patientId: `00000000-0000-4000-8000-${String(patientNumber).padStart(12, '0')}`,
  assignedDoctorId: ids.medicoClinica, department: 'Atendimento especializado',
  ticketDate: today, code, createdBy,
}).onConflictDoNothing({ target: [queueTickets.facilityId, queueTickets.ticketDate, queueTickets.department, queueTickets.code] });

console.log('Seed fictícia aplicada: unidades, equipes, contas, 25 pacientes e ocupação parcial de demonstração. Logins atualizados para @atende.com; senha definida por DEMO_FLOW_PASSWORD ou DEMO_PASSWORD.');
await pool.end();
