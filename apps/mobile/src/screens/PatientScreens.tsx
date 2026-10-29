import React from 'react';
import { Text, TextInput, View } from 'react-native';
import type { Facility, Journey, Report, PickedFile } from '../types';
import { date, occupancyLabel } from '../api';
import { styles } from '../styles';
import { JourneyProgress } from '../components/JourneyProgress';
import { FacilityMap } from './FacilityMap';

type Props = {
  error: string; linked: boolean; screen: 'inicio' | 'historico' | 'unidades' | 'laudos'; journey: Journey | null;
  facilities: Facility[]; mapped: Facility[]; mapsEnabled: boolean; reports: Report[];
  title: string; setTitle: (value: string) => void; description: string; setDescription: (value: string) => void;
  file: PickedFile | null; button: (label: string, onPress: () => void, secondary?: boolean) => React.ReactNode;
  card: (children: React.ReactNode) => React.ReactNode; linkCode: string; setLinkCode: (value: string) => void;
  link: () => void; exportHistory: () => void; load: () => Promise<void>; act: (run: () => Promise<void>) => void;
  pick: () => void; upload: () => void; download: (report: Report) => void;
};

export function PatientScreens({ error, linked, screen, journey, facilities, mapped, mapsEnabled, reports, title, setTitle, description, setDescription, file, button, card, linkCode, setLinkCode, link, exportHistory, load, act, pick, upload, download }: Props) {
  return <>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {!linked && screen !== 'unidades' ? card(<><Text style={styles.heading}>Vincule seu cadastro</Text><Text style={styles.sub}>Peça um código à recepção após conferência presencial da identidade. CPF sozinho não libera o prontuário.</Text><TextInput style={styles.input} placeholder="Código de vínculo" value={linkCode} onChangeText={setLinkCode} autoCapitalize="characters"/>{button('Vincular cadastro', link)}</>) : null}
    {screen === 'inicio' && linked ? <><Text style={styles.title}>Olá, {journey?.patient.fullName.split(' ')[0] || 'paciente'}</Text><Text style={styles.sub}>Sua jornada atual</Text>{journey?.flow ? <JourneyProgress flow={journey.flow} facilities={facilities}/> : card(<Text>Nenhum atendimento registrado ainda.</Text>)}</> : null}
    {screen === 'historico' && linked ? <><Text style={styles.title}>Prontuário eletrônico</Text><Text style={styles.sub}>Histórico dos seus atendimentos registrados.</Text>{button('Exportar histórico em PDF', exportHistory)}{journey?.history.length ? journey.history.map((item) => card(<View key={item.id}><Text style={styles.heading}>{item.facilityName}</Text><Text style={styles.muted}>{date(item.createdAt)} · {item.doctorName}</Text><Text style={styles.label}>Evolução</Text><Text>{item.evolution}</Text>{item.diagnosis ? <><Text style={styles.label}>Diagnóstico ou hipótese</Text><Text>{item.diagnosis}</Text></> : null}{item.conduct ? <><Text style={styles.label}>Conduta</Text><Text>{item.conduct}</Text></> : null}</View>)) : card(<Text>Nenhum atendimento concluído ainda.</Text>)}</> : null}
    {screen === 'unidades' ? <><Text style={styles.title}>UPAs e postos</Text><Text style={styles.sub}>Lotação atual das unidades fictícias. Não indica tempo de espera nem disponibilidade de vagas.</Text>{mapped.length ? <FacilityMap mapped={mapped} mapsEnabled={mapsEnabled}/> : card(<Text>Mapa indisponível para estas unidades. Consulte a lista abaixo.</Text>)}{facilities.filter((item) => item.type === 'UBS' || item.type === 'UPA').map((item) => card(<View key={item.id}><Text style={styles.heading}>{item.name}</Text><Text>{item.address}</Text><Text style={styles.occupancy}>{item.occupancy?.active ?? 0}/{item.occupancyCapacity ?? '—'} pessoas · {occupancyLabel(item.occupancy?.status)}</Text><Text style={styles.muted}>Atualizado: {item.occupancy?.updatedAt ? date(item.occupancy.updatedAt) : 'sem atualização registrada'}</Text></View>))}{button('Atualizar lotação', () => void act(load), true)}</> : null}
    {screen === 'laudos' && linked ? <><Text style={styles.title}>Meus laudos</Text><Text style={styles.sub}>Anexe PDF, PNG ou JPEG de até 10 MB.</Text>{card(<><TextInput style={styles.input} placeholder="Título do laudo" value={title} onChangeText={setTitle} maxLength={160}/><TextInput style={[styles.input,styles.multiline]} placeholder="Descrição (opcional)" value={description} onChangeText={setDescription} multiline maxLength={2000}/>{button(file ? file.name : 'Escolher arquivo', pick, true)}{button('Enviar laudo', upload)}</>)}{reports.length ? reports.map((item) => card(<View key={item.id}><Text style={styles.heading}>{item.title}</Text><Text style={styles.muted}>{item.fileName} · {date(item.createdAt)}</Text>{item.description ? <Text>{item.description}</Text> : null}{button('Abrir ou compartilhar arquivo', () => download(item), true)}</View>)) : card(<Text>Nenhum laudo enviado.</Text>)}</> : null}
  </>;
}
