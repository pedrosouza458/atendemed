import type { OpenAPIHono } from '@hono/zod-openapi';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type Database } from '@atende/database';
import { ApiError, audit, guardMutation, membership, principal, type AppEnv, type Principal, withDb } from '../../core';
import { body } from '../../http';
import { arrivalCheckIn, facilityInput, membershipInput, membershipUpdate, occupancyCapacityInput, serviceInput } from './schemas';
import { closeArrival, listActiveArrivals, occupancyByFacility, registerArrivalAndTicket } from './occupancy';

const uuid = z.string().uuid();

async function facilityAdmin(db: Database, actor: Principal, facilityId: string): Promise<void> {
  if (actor.isSystemAdmin) return;
  await membership(db, actor, facilityId, ['ADMIN']);
}

export function registerFacilityRoutes(app: OpenAPIHono<AppEnv>): void {
  app.get('/v1/facilities', async (c) => withDb(c, async (db) => {
    const facilities = await db.select({ id: schema.healthcareFacilities.id, name: schema.healthcareFacilities.name,
      type: schema.healthcareFacilities.type, address: schema.healthcareFacilities.address,
      latitude: schema.healthcareFacilities.latitude, longitude: schema.healthcareFacilities.longitude,
      phone: schema.healthcareFacilities.phone, occupancyCapacity: schema.healthcareFacilities.occupancyCapacity,
    }).from(schema.healthcareFacilities).where(eq(schema.healthcareFacilities.active, true));
    const [occupancies, serviceRows] = await Promise.all([
      occupancyByFacility(db, facilities),
      db.select({ facilityId: schema.facilityServices.facilityId, name: schema.facilityServices.name })
        .from(schema.facilityServices).where(eq(schema.facilityServices.active, true)),
    ]);
    const servicesByFacility = new Map<string, string[]>();
    for (const service of serviceRows) servicesByFacility.set(service.facilityId, [...(servicesByFacility.get(service.facilityId) ?? []), service.name]);
    return c.json({ facilities: facilities.map((facility) => ({
      ...facility,
      services: servicesByFacility.get(facility.id) ?? [],
      occupancy: occupancies.get(facility.id) ?? null,
    })) });
  }));

  app.get('/v1/facilities/:id', async (c) => withDb(c, async (db) => {
    const facilityId = uuid.parse(c.req.param('id'));
    const [facility] = await db.select().from(schema.healthcareFacilities).where(and(
      eq(schema.healthcareFacilities.id, facilityId), eq(schema.healthcareFacilities.active, true),
    )).limit(1);
    if (!facility) throw new ApiError(404, 'NOT_FOUND', 'Unidade não encontrada');
    const services = await db.select({ code: schema.facilityServices.code, name: schema.facilityServices.name })
      .from(schema.facilityServices).where(and(eq(schema.facilityServices.facilityId, facilityId), eq(schema.facilityServices.active, true)));
    const hours = await db.select().from(schema.facilityHours).where(eq(schema.facilityHours.facilityId, facilityId));
    return c.json({ facility, services, hours });
  }));

  app.get('/v1/facilities/:id/doctors', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db);
    const facilityId = uuid.parse(c.req.param('id'));
    await membership(db, actor, facilityId, ['RECEPTIONIST']);
    const doctors = await db.select({ id: schema.users.id, name: schema.users.name, specialties: schema.doctors.specialties })
      .from(schema.staffMemberships).innerJoin(schema.users, eq(schema.users.id, schema.staffMemberships.userId))
      .innerJoin(schema.doctors, eq(schema.doctors.userId, schema.users.id)).where(and(
        eq(schema.staffMemberships.facilityId, facilityId), eq(schema.staffMemberships.role, 'DOCTOR'),
        eq(schema.staffMemberships.status, 'ACTIVE'), eq(schema.users.status, 'ACTIVE'),
        eq(schema.doctors.verificationStatus, 'VERIFIED'),
      ));
    return c.json({ doctors });
  }));

  app.get('/v1/facilities/:id/occupancy', async (c) => withDb(c, async (db) => {
    const facilityId = uuid.parse(c.req.param('id'));
    const [facility] = await db.select({ id: schema.healthcareFacilities.id, type: schema.healthcareFacilities.type,
      occupancyCapacity: schema.healthcareFacilities.occupancyCapacity,
    }).from(schema.healthcareFacilities).where(and(eq(schema.healthcareFacilities.id, facilityId), eq(schema.healthcareFacilities.active, true))).limit(1);
    if (!facility) throw new ApiError(404, 'NOT_FOUND', 'Unidade não encontrada');
    const occupancy = (await occupancyByFacility(db, [facility])).get(facilityId) ?? null;
    if (!occupancy) throw new ApiError(404, 'OCCUPANCY_UNSUPPORTED', 'Lotação não disponível para esta unidade');
    return c.json({ occupancy });
  }));

  app.patch('/v1/facilities/:id/occupancy-capacity', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db);
    guardMutation(c, actor);
    const facilityId = uuid.parse(c.req.param('id'));
    await facilityAdmin(db, actor, facilityId);
    const input = await body(c, occupancyCapacityInput);
    const [facility] = await db.select({ type: schema.healthcareFacilities.type })
      .from(schema.healthcareFacilities).where(and(
        eq(schema.healthcareFacilities.id, facilityId), eq(schema.healthcareFacilities.active, true),
      )).limit(1);
    if (!facility) throw new ApiError(404, 'NOT_FOUND', 'Unidade não encontrada');
    if (facility.type !== 'UBS' && facility.type !== 'UPA' && facility.type !== 'CLINIC') {
      throw new ApiError(422, 'OCCUPANCY_UNSUPPORTED', 'Capacidade de lotação disponível para UBS, UPA e clínica');
    }
    await db.transaction(async (tx) => {
      await tx.update(schema.healthcareFacilities).set({ occupancyCapacity: input.occupancyCapacity, updatedAt: new Date() })
        .where(eq(schema.healthcareFacilities.id, facilityId));
      await audit(tx, actor, 'FACILITY_OCCUPANCY_CAPACITY_UPDATED', 'facility', facilityId, facilityId, 'ADMINISTRATION');
    });
    return c.json({ facilityId, occupancyCapacity: input.occupancyCapacity });
  }));

  app.get('/v1/facilities/:id/arrivals', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db);
    const facilityId = uuid.parse(c.req.param('id'));
    await membership(db, actor, facilityId, ['RECEPTIONIST']);
    const arrivals = await listActiveArrivals(db, facilityId);
    await audit(db, actor, 'FACILITY_ARRIVALS_READ', 'facility_arrival', null, facilityId, 'OCCUPANCY');
    return c.json({ arrivals });
  }));

  app.post('/v1/facilities/:id/check-ins', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db);
    guardMutation(c, actor);
    const facilityId = uuid.parse(c.req.param('id'));
    await membership(db, actor, facilityId, ['RECEPTIONIST']);
    const input = await body(c, arrivalCheckIn);
    return c.json(await registerArrivalAndTicket(db, actor, facilityId, input.cpf, input.department, input.doctorId), 201);
  }));

  app.post('/v1/facilities/:id/arrivals/:arrivalId/close', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db);
    guardMutation(c, actor);
    const facilityId = uuid.parse(c.req.param('id'));
    const arrivalId = uuid.parse(c.req.param('arrivalId'));
    await membership(db, actor, facilityId, ['RECEPTIONIST']);
    return c.json(await closeArrival(db, actor, facilityId, arrivalId));
  }));

  app.post('/v1/facilities', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db);
    guardMutation(c, actor);
    if (!actor.isSystemAdmin) throw new ApiError(403, 'FORBIDDEN', 'Apenas administração da plataforma');
    const input = await body(c, facilityInput);
    const result = await db.transaction(async (tx) => {
      const [facility] = await tx.insert(schema.healthcareFacilities).values(input).returning({ id: schema.healthcareFacilities.id });
      await audit(tx, actor, 'FACILITY_CREATED', 'facility', facility!.id, facility!.id, 'ADMINISTRATION');
      return facility!;
    });
    return c.json(result, 201);
  }));

  app.post('/v1/facilities/:id/services', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db);
    guardMutation(c, actor);
    const facilityId = uuid.parse(c.req.param('id'));
    await facilityAdmin(db, actor, facilityId);
    const input = await body(c, serviceInput);
    const result = await db.transaction(async (tx) => {
      const [service] = await tx.insert(schema.facilityServices).values({ facilityId, ...input }).returning({ id: schema.facilityServices.id });
      await audit(tx, actor, 'FACILITY_SERVICE_CREATED', 'facility_service', service!.id, facilityId, 'ADMINISTRATION');
      return service!;
    });
    return c.json(result, 201);
  }));

  app.get('/v1/facilities/:id/memberships', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db);
    const facilityId = uuid.parse(c.req.param('id'));
    await facilityAdmin(db, actor, facilityId);
    const memberships = await db.select({ id: schema.staffMemberships.id, userId: schema.users.id,
      name: schema.users.name, email: schema.users.email, role: schema.staffMemberships.role,
      status: schema.staffMemberships.status,
    }).from(schema.staffMemberships).innerJoin(schema.users, eq(schema.staffMemberships.userId, schema.users.id))
      .where(eq(schema.staffMemberships.facilityId, facilityId));
    return c.json({ memberships });
  }));

  app.post('/v1/facilities/:id/memberships', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db);
    guardMutation(c, actor);
    const facilityId = uuid.parse(c.req.param('id'));
    await facilityAdmin(db, actor, facilityId);
    const input = await body(c, membershipInput);
    const [target] = await db.select({ id: schema.users.id }).from(schema.users).where(and(eq(schema.users.id, input.userId), eq(schema.users.status, 'ACTIVE'))).limit(1);
    if (!target) throw new ApiError(404, 'NOT_FOUND', 'Usuário não encontrado');
    if (input.role === 'DOCTOR') {
      const [doctor] = await db.select({ id: schema.doctors.id }).from(schema.doctors).where(and(eq(schema.doctors.userId, target.id), eq(schema.doctors.verificationStatus, 'VERIFIED'))).limit(1);
      if (!doctor) throw new ApiError(422, 'PROFILE_REQUIRED', 'Perfil médico verificado necessário');
    }
    if (input.role === 'RECEPTIONIST') {
      const [receptionist] = await db.select({ id: schema.receptionists.id }).from(schema.receptionists).where(and(eq(schema.receptionists.userId, target.id), eq(schema.receptionists.status, 'ACTIVE'))).limit(1);
      if (!receptionist) throw new ApiError(422, 'PROFILE_REQUIRED', 'Perfil de atendente ativo necessário');
    }
    const result = await db.transaction(async (tx) => {
      const [record] = await tx.insert(schema.staffMemberships).values({ userId: input.userId, facilityId, role: input.role })
        .onConflictDoUpdate({ target: [schema.staffMemberships.userId, schema.staffMemberships.facilityId, schema.staffMemberships.role], set: { status: 'ACTIVE', updatedAt: new Date() } })
        .returning({ id: schema.staffMemberships.id });
      await audit(tx, actor, 'MEMBERSHIP_GRANTED', 'staff_membership', record!.id, facilityId, 'ADMINISTRATION');
      return record!;
    });
    return c.json(result, 201);
  }));

  app.patch('/v1/facilities/:id/memberships/:membershipId', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db);
    guardMutation(c, actor);
    const facilityId = uuid.parse(c.req.param('id'));
    const membershipId = uuid.parse(c.req.param('membershipId'));
    await facilityAdmin(db, actor, facilityId);
    const input = await body(c, membershipUpdate);
    const [existing] = await db.select().from(schema.staffMemberships).where(and(
      eq(schema.staffMemberships.id, membershipId), eq(schema.staffMemberships.facilityId, facilityId),
    )).limit(1);
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Vínculo não encontrado');
    if (existing.userId === actor.userId && existing.role === 'ADMIN' && input.status === 'INACTIVE') {
      throw new ApiError(422, 'SELF_REVOKE', 'Não é possível desativar o próprio vínculo administrativo');
    }
    await db.transaction(async (tx) => {
      await tx.update(schema.staffMemberships).set({ status: input.status, updatedAt: new Date() }).where(eq(schema.staffMemberships.id, membershipId));
      await audit(tx, actor, 'MEMBERSHIP_UPDATED', 'staff_membership', membershipId, facilityId, 'ADMINISTRATION');
    });
    return c.json({ id: membershipId, status: input.status });
  }));
}
