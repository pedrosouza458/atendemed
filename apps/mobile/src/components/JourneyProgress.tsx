import React from 'react';
import { Text, View } from 'react-native';
import { date, occupancyLabel } from '../api';
import { styles } from '../styles';
import type { Facility, PatientFlow } from '../types';

const steps = ['Chegada e senha', 'Médico do posto', 'Envio pela recepção', 'Recepção da clínica', 'Médico da clínica', 'Concluído'];
const status: Record<PatientFlow['stage'], { position: number; label: string }> = {
  WAITING_CALL: { position: 0, label: 'Aguardando a chamada da senha' },
  CALLED: { position: 0, label: 'Senha chamada pela recepção' },
  SOURCE_CARE: { position: 1, label: 'Em atendimento no posto' },
  WAITING_DISPATCH: { position: 2, label: 'Aguardando a recepção enviar à clínica' },
  CLINIC_RECEPTION: { position: 3, label: 'Encaminhamento recebido pela clínica' },
  CLINIC_ASSIGNED: { position: 4, label: 'Médico da clínica designado' },
  CLINIC_ACCEPTED: { position: 4, label: 'Médico da clínica recebeu o caso' },
  CLINIC_CARE: { position: 4, label: 'Em atendimento na clínica' },
  COMPLETED: { position: 5, label: 'Atendimento na clínica concluído' },
  SOURCE_COMPLETED: { position: 5, label: 'Atendimento no posto concluído' },
  DECLINED: { position: 3, label: 'Clínica não aceitou o encaminhamento' },
  CANCELLED: { position: 0, label: 'Atendimento cancelado ou ausência registrada' },
};

export function JourneyProgress({ flow, facilities }: { flow: PatientFlow; facilities: Facility[] }) {
  const current = status[flow.stage];
  const clinic = facilities.find((facility) => facility.id === flow.targetFacilityId && facility.type === 'CLINIC');
  const showSourceCode = ['WAITING_CALL', 'CALLED', 'SOURCE_CARE'].includes(flow.stage);
  return <View style={styles.card}>
    <Text style={styles.label}>ETAPA ATUAL</Text>
    <Text style={styles.heading}>{current.label}</Text>
    <Text>{flow.sourceFacilityName}{flow.targetFacilityName ? ` → ${flow.targetFacilityName}` : ''}</Text>
    {showSourceCode && <Text style={styles.code}>Senha {flow.code}</Text>}
    <Text style={styles.muted}>Atualizado em {date(flow.updatedAt)}</Text>
    <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${((current.position + 1) / steps.length) * 100}%` }]} /></View>
    {steps.map((step, index) => <View key={step} style={styles.progressStep}>
      <Text style={index <= current.position ? styles.progressDone : styles.progressPending}>{index < current.position ? '✓' : String(index + 1)}</Text>
      <Text style={index <= current.position ? styles.progressDone : styles.progressPending}>{step}</Text>
    </View>)}
    {clinic?.occupancy && <Text style={styles.occupancy}>{clinic.name}: {clinic.occupancy.active}/{clinic.occupancyCapacity ?? '—'} pessoas · {occupancyLabel(clinic.occupancy.status)}</Text>}
  </View>;
}
