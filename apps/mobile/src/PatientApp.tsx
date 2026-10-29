import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import Constants from 'expo-constants';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HttpError, request, date, escapeHtml, green, baseUrl } from './api';
import type { Facility, Journey, PickedFile, Report } from './types';
import { PatientScreens } from './screens/PatientScreens';
import type { ReactNode } from 'react';
import { PatientAuth } from './components/PatientAuth';
import { PatientNavigation } from './components/PatientNavigation';
import { styles } from './styles';
import { readSession, saveSession, deleteSession } from './session';

export default function PatientApp() {
  const [token, setToken] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [screen, setScreen] = useState<'inicio' | 'historico' | 'unidades' | 'laudos'>('inicio');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [linkCode, setLinkCode] = useState('');
  const [journey, setJourney] = useState<Journey | null>(null); const [linked, setLinked] = useState(true);
  const [facilities, setFacilities] = useState<Facility[]>([]); const [reports, setReports] = useState<Report[]>([]);
  const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [file, setFile] = useState<PickedFile | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const mapsEnabled = Boolean(Constants.expoConfig?.extra?.googleMapsEnabled);
  useEffect(() => { void readSession().then(setToken).finally(() => setBooting(false)); }, []);
  const load = useCallback(async () => {
    const locations = await request<{ facilities: Facility[] }>('/v1/facilities');
    setFacilities(locations.facilities);
    if (!token) return;
    const [care, uploaded] = await Promise.allSettled([request<Journey>('/v1/me/journey', token), request<{ reports: Report[] }>('/v1/me/reports', token)]);
    if (care.status === 'fulfilled') { setJourney(care.value); setLinked(true); }
    else if (care.reason instanceof HttpError && care.reason.code === 'PATIENT_NOT_LINKED') { setJourney(null); setLinked(false); }
    else throw care.status === 'rejected' ? care.reason : new Error('Não foi possível carregar a jornada.');
    if (uploaded.status === 'fulfilled') setReports(uploaded.value.reports);
    else if (care.status === 'fulfilled') throw uploaded.reason;
  }, [token]);
  const clearSession = async () => { await deleteSession(); setToken(null); setJourney(null); setReports([]); };
  useEffect(() => {
    let loading = false;
    const refresh = async () => {
      if (loading) return;
      loading = true;
      try { await load(); setError(''); }
      catch (cause) { if (cause instanceof HttpError && cause.status === 401) await clearSession(); else setError(cause instanceof Error ? cause.message : 'Erro ao carregar dados.'); }
      finally { loading = false; }
    };
    void refresh();
    if (!token) return;
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 10_000);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void refresh(); });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [load, token]);
  const act = async (run: () => Promise<void>) => { setBusy(true); setError(''); try { await run(); } catch (cause) { if (cause instanceof HttpError && cause.status === 401) await clearSession(); else setError(cause instanceof Error ? cause.message : 'Erro inesperado.'); } finally { setBusy(false); } };
  const login = () => void act(async () => {
    if (authMode === 'register') { await request('/v1/auth/register', undefined, { method: 'POST', body: JSON.stringify({ name, email, password }) }); setAuthMode('login'); Alert.alert('Conta criada', 'Entre com seu e-mail e senha. O prontuário aparece após vínculo presencial.'); return; }
    const result = await request<{ token: string }>('/v1/auth/login', undefined, { method: 'POST', body: JSON.stringify({ email, password, client: 'mobile' }) });
    await saveSession(result.token); setToken(result.token);
  });
  const logout = () => void act(async () => { try { if (token) await request('/v1/auth/logout', token, { method: 'POST' }); } finally { await clearSession(); } });
  const link = () => void act(async () => { await request('/v1/patients/link', token!, { method: 'POST', body: JSON.stringify({ code: linkCode.trim() }) }); setLinked(true); setAuthMode('login'); await load(); });
  const pick = () => void act(async () => { const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/png', 'image/jpeg'], copyToCacheDirectory: true }); if (!result.canceled) setFile(result.assets[0]); });
  const upload = () => void act(async () => {
    if (!title.trim() || !file) throw new Error('Informe o título e escolha um arquivo.');
    const form = new FormData(); form.append('title', title.trim()); form.append('description', description.trim());
    form.append('file', { uri: file.uri, name: file.name, type: file.mimeType || 'application/octet-stream' } as unknown as Blob);
    await request('/v1/me/reports', token!, { method: 'POST', body: form });
    setTitle(''); setDescription(''); setFile(null);
    setReports((await request<{ reports: Report[] }>('/v1/me/reports', token!)).reports);
    Alert.alert('Laudo enviado', 'Seu arquivo foi guardado na área de laudos.');
  });
  const download = (report: Report) => void act(async () => {
    const uri = `${FileSystem.cacheDirectory}${report.id}-${report.fileName}`;
    const result = await FileSystem.downloadAsync(`${baseUrl}/v1/me/reports/${report.id}`, uri, { headers: { Authorization: `Bearer ${token}` } });
    if (result.status !== 200) throw new Error('Não foi possível abrir o laudo.');
    await Sharing.shareAsync(result.uri, { mimeType: report.mimeType });
  });
  const exportHistory = () => void act(async () => {
    if (!journey) return;
    const rows = journey.history.map((item) => `<section><h2>${escapeHtml(item.facilityName)} · ${date(item.createdAt)}</h2><p>Profissional: ${escapeHtml(item.doctorName)}</p><p>${escapeHtml(item.evolution)}</p><p>Diagnóstico: ${escapeHtml(item.diagnosis || 'Não informado')}</p><p>Conduta: ${escapeHtml(item.conduct || 'Não informada')}</p></section>`).join('');
    const html = `<html><head><meta charset="utf-8"><style>body{font-family:Arial;padding:24px;color:#173e35}section{border-top:1px solid #ddd;padding:12px 0}h1{color:#177862}</style></head><body><h1>Prontuário eletrônico · Atende</h1><p>${escapeHtml(journey.patient.fullName)}</p><p>Exportado em ${date(new Date().toISOString())}</p>${rows || '<p>Sem atendimentos registrados.</p>'}</body></html>`;
    const pdf = await Print.printToFileAsync({ html }); await Sharing.shareAsync(pdf.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  });
  const button = (label: string, onPress: () => void, secondary = false) => <Pressable accessibilityRole="button" onPress={onPress} disabled={busy} style={[styles.button, secondary && styles.secondary]}><Text style={[styles.buttonText, secondary && styles.secondaryText]}>{label}</Text></Pressable>;
  const card = (children: ReactNode) => <View style={styles.card}>{children}</View>;
  if (booting) return <SafeAreaView style={styles.center}><ActivityIndicator color={green}/></SafeAreaView>;
  if (!token) return <SafeAreaView style={styles.root}><PatientAuth authMode={authMode} name={name} setName={setName} email={email} setEmail={setEmail} password={password} setPassword={setPassword} error={error} button={button} login={login} setAuthMode={setAuthMode}/></SafeAreaView>;
  const mapped = facilities.filter((item) => (item.type === 'UBS' || item.type === 'UPA') && item.latitude !== null && item.longitude !== null);
  return <SafeAreaView style={styles.root}><View style={styles.top}><Text style={styles.brand}>atende</Text><Pressable accessibilityRole="button" onPress={logout}><Text style={styles.link}>Sair</Text></Pressable></View><PatientNavigation screen={screen} onChange={setScreen}/><ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={busy} onRefresh={() => void act(load)}/>}>
    <PatientScreens error={error} linked={linked} screen={screen} journey={journey} facilities={facilities} mapped={mapped} mapsEnabled={mapsEnabled} reports={reports} title={title} setTitle={setTitle} description={description} setDescription={setDescription} file={file} button={button} card={card} linkCode={linkCode} setLinkCode={setLinkCode} link={link} exportHistory={exportHistory} load={load} act={act} pick={pick} upload={upload} download={download}/>
  </ScrollView></SafeAreaView>;
}

