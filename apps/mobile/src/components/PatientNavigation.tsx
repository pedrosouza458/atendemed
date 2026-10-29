import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { styles } from '../styles';

export type PatientScreen = 'inicio' | 'historico' | 'unidades' | 'laudos';
const labels: Record<PatientScreen, string> = { inicio: 'Início', historico: 'Histórico', unidades: 'Unidades', laudos: 'Laudos' };

export function PatientNavigation({ screen, onChange }: { screen: PatientScreen; onChange: (screen: PatientScreen) => void }) {
  return <View style={styles.nav}>{(Object.keys(labels) as PatientScreen[]).map((item) => <Pressable key={item} onPress={() => onChange(item)} style={[styles.tab, screen === item && styles.selected]}><Text style={[styles.tabText, screen === item && styles.selectedText]}>{labels[item]}</Text></Pressable>)}</View>;
}
