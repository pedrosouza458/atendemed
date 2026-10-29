export type StaffRole = 'RECEPTIONIST' | 'DOCTOR' | 'ADMIN';
export type FacilityType = 'UBS' | 'UPA' | 'CLINIC' | 'HOSPITAL' | 'DIAGNOSTIC_CENTER';

export const facilityTypes = ['UBS', 'UPA', 'CLINIC', 'HOSPITAL', 'DIAGNOSTIC_CENTER'] as const;
export const staffRoles = ['RECEPTIONIST', 'DOCTOR', 'ADMIN'] as const;
export { hashPassword, verifyPassword, randomToken, tokenHash } from './crypto';
