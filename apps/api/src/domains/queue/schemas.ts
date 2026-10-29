import { z } from 'zod';

export const queueIssue = z.strictObject({ patientId: z.string().uuid(), department: z.string().trim().min(2).max(80), doctorId: z.string().uuid() });
export const queueDepartment = z.string().trim().min(2).max(80).optional();
export const queueDisposition = z.strictObject({ status: z.enum(['CANCELLED', 'NO_SHOW']) });
export const queuePriority = z.strictObject({ priority: z.number().int().min(1).max(3), priorityReason: z.string().trim().min(3).max(500) });
export const attendanceDraft = z.strictObject({
  subjective: z.string().max(8000).default(''), objective: z.string().max(8000).default(''),
  vitals: z.record(z.string(), z.union([z.number().finite(), z.string().max(80), z.null()])).default({}),
  painLocation: z.string().max(120).default(''), painScore: z.number().int().min(0).max(10).nullable().default(null),
  assessment: z.string().max(4000).default(''), diagnosis: z.string().max(2000).default(''),
  actions: z.array(z.enum(['ORIENTATION', 'EXAM', 'PROCEDURE', 'REFERRAL'])).max(4).default([]),
  plan: z.string().max(6000).default(''), disposition: z.enum(['DISCHARGE', 'RETURN', 'REFERRAL', 'OBSERVATION']).nullable().default(null),
  followUp: z.string().max(2000).default(''), referralFacilityId: z.string().uuid().nullable().default(null),
  referralUrgency: z.enum(['ROUTINE', 'PRIORITY', 'URGENT']).nullable().default(null), referralReason: z.string().max(2000).default(''), referralMessage: z.string().max(4000).default(''),
});
export const triageInput = z.strictObject({
  reason: z.string().trim().min(2).max(4000), notes: z.string().trim().max(8000).optional(),
  vitals: z.record(z.string(), z.union([z.number().finite(), z.string().max(80), z.null()])).default({}),
  priority: z.number().int().min(0).max(3).default(0), priorityReason: z.string().trim().min(3).max(500).optional(),
  draft: attendanceDraft.default({ subjective: '', objective: '', vitals: {}, painLocation: '', painScore: null, assessment: '', diagnosis: '', actions: [], plan: '', disposition: null, followUp: '', referralFacilityId: null, referralUrgency: null, referralReason: '', referralMessage: '' }),
}).superRefine((value, ctx) => {
  if (value.priority > 0 && !value.priorityReason) ctx.addIssue({ code: 'custom', path: ['priorityReason'], message: 'Justificativa clínica obrigatória para prioridade' });
});
export const attendanceComplete = attendanceDraft.superRefine((value, ctx) => {
  if (value.subjective.trim().length < 2) ctx.addIssue({ code: 'custom', path: ['subjective'], message: 'Informe o motivo do atendimento' });
  if (value.disposition === 'REFERRAL') {
    if (!value.referralUrgency) ctx.addIssue({ code: 'custom', path: ['referralUrgency'], message: 'Informe a urgência' });
    if (value.referralReason.trim().length < 3) ctx.addIssue({ code: 'custom', path: ['referralReason'], message: 'Informe a indicação clínica para o encaminhamento' });
  }
});
export const referralStatusInput = z.strictObject({ status: z.enum(['ACCEPTED', 'DECLINED']) });
export const referralAssignInput = z.strictObject({ doctorId: z.string().uuid() });
export const referralDispatchInput = z.strictObject({ targetFacilityId: z.string().uuid(), message: z.string().max(4000).default('') });
