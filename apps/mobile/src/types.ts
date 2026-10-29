import type * as DocumentPicker from 'expo-document-picker';

export type Patient = { id: string; fullName: string; birthDate: string };
export type History = { id: string; createdAt: string; facilityName: string; doctorName: string; evolution: string; diagnosis: string | null; conduct: string | null };
export type Ticket = { id: string; code: string; status: string; facilityName: string; issuedAt: string };
export type Attendance = { id: string; facilityName: string; startedAt: string; status: string };
export type Referral = { id: string; facilityName: string; reason: string; status: string; createdAt: string };
export type FlowStage = 'WAITING_CALL' | 'CALLED' | 'SOURCE_CARE' | 'WAITING_DISPATCH' | 'CLINIC_RECEPTION' | 'CLINIC_ASSIGNED' | 'CLINIC_ACCEPTED' | 'CLINIC_CARE' | 'COMPLETED' | 'SOURCE_COMPLETED' | 'DECLINED' | 'CANCELLED';
export type PatientFlow = { ticketId: string; code: string; sourceFacilityName: string; targetFacilityId: string | null; targetFacilityName: string | null; stage: FlowStage; updatedAt: string };
export type Journey = { patient: Patient; history: History[]; tickets: Ticket[]; attendances: Attendance[]; referrals: Referral[]; flow: PatientFlow | null };
export type Facility = { id: string; name: string; type: string; address: string; latitude: number | null; longitude: number | null; occupancyCapacity: number | null; occupancy: { active: number; status: string; updatedAt: string | null } | null };
export type Report = { id: string; title: string; description: string | null; fileName: string; mimeType: string; createdAt: string };
export type PickedFile = DocumentPicker.DocumentPickerAsset;
