import { StyleSheet } from 'react-native';
import { green } from './api';

export const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f8f6' }, center: { flex: 1, justifyContent: 'center' }, content: { padding: 20, paddingBottom: 48, gap: 16 },
  top: { paddingHorizontal: 20, paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, brand: { fontSize: 30, fontWeight: '800', color: green }, link: { color: green, fontWeight: '700', fontSize: 16 },
  nav: { flexDirection: 'row', paddingHorizontal: 10, gap: 4 }, tab: { flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: 12 }, selected: { backgroundColor: green }, tabText: { fontSize: 12, color: '#3c5b53', fontWeight: '700' }, selectedText: { color: 'white' },
  title: { fontSize: 26, color: '#143e34', fontWeight: '800' }, heading: { fontSize: 18, fontWeight: '700', color: '#174d40', marginBottom: 8 }, sub: { color: '#526e65', fontSize: 15, lineHeight: 22 }, muted: { color: '#70877f', marginTop: 8 }, label: { color: '#65847a', fontWeight: '700', fontSize: 12, marginTop: 14 },
  card: { backgroundColor: 'white', borderRadius: 16, padding: 18, gap: 5, borderWidth: 1, borderColor: '#e1eae5' }, button: { backgroundColor: green, minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 10, paddingHorizontal: 16, marginTop: 8 }, buttonText: { color: 'white', fontSize: 15, fontWeight: '700' }, secondary: { backgroundColor: '#e6f1eb' }, secondaryText: { color: green },
  input: { borderWidth: 1, borderColor: '#cddcd3', borderRadius: 10, minHeight: 48, paddingHorizontal: 14, backgroundColor: 'white', fontSize: 16 }, multiline: { minHeight: 90, textAlignVertical: 'top', paddingTop: 12 },
  error: { color: '#a33333', fontSize: 15 }, code: { fontSize: 42, color: green, fontWeight: '800' }, occupancy: { color: green, fontWeight: '700', fontSize: 16, marginTop: 10 }, map: { height: 310, borderRadius: 16 }, marker: { backgroundColor: green, borderRadius: 14, padding: 8 }, markerText: { color: 'white', fontWeight: '700' },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: '#e1eae5', marginTop: 16, marginBottom: 10, overflow: 'hidden' },
  progressFill: { height: 8, backgroundColor: green }, progressStep: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  progressDone: { color: '#174d40', fontWeight: '700' }, progressPending: { color: '#8ca49a' },
});
