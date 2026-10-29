import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { AppNotification, Facility, Membership, User } from './types';
import { Login } from './features/login/Login';
import { Patients } from './features/patients/Patients';
import { Queue } from './features/queue/Queue';
import { ReferralWorkspace } from './features/referrals/ReferralWorkspace';
import { CapacitySettings } from './features/facilities/CapacitySettings';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facilityId, setFacilityId] = useState('');
  const [section, setSection] = useState<'overview' | 'patients' | 'queue' | 'referrals' | 'capacity'>('overview');
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [openReferralId, setOpenReferralId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const role = memberships.find((item) => item.facilityId === facilityId)?.role;
  const facility = facilities.find((item) => item.id === facilityId);
  const refreshAuth = useCallback(async () => {
    try {
      const [auth, locations] = await Promise.all([api<{ user: User; memberships: Membership[] }>('/v1/auth/me'), api<{ facilities: Facility[] }>('/v1/facilities')]);
      const activeMemberships = auth.user.isSystemAdmin
        ? locations.facilities.filter((item) => item.type === 'UBS' || item.type === 'UPA').map((item) => ({ facilityId: item.id, role: 'ADMIN' as const }))
        : auth.memberships;
      setUser(auth.user); setMemberships(activeMemberships); setFacilities(locations.facilities);
      // Do not carry a previous account's facility into this session. It may
      // have a different role (or no membership) and hide the right workspace.
      const initialMembership = activeMemberships[0];
      setFacilityId(initialMembership?.facilityId || '');
      setSection(initialMembership?.role === 'RECEPTIONIST' ? 'referrals' : 'overview');
    } catch { setUser(null); }
  }, []);
  useEffect(() => { void refreshAuth(); }, [refreshAuth]);
  useEffect(() => {
    if (!user) { setNotifications([]); return; }
    let active = true;
    const load = () => { void api<{notifications:AppNotification[]}>('/v1/me/notifications').then((result) => { if (active) setNotifications(result.notifications); }).catch(() => {}); };
    load(); const timer = window.setInterval(load, 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, [user]);
  const message = (action: () => Promise<void>) => async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setNotice(''); setBusy(true);
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Erro inesperado.'); }
    finally { setBusy(false); }
  };
  const logout = async () => {
    await api('/v1/auth/logout', { method: 'POST' });
    setUser(null); setMemberships([]); setFacilities([]); setFacilityId('');
    setSection('overview'); setOpenReferralId(null);
  };
  const openNotification = async (item:AppNotification) => {
    setNotificationOpen(false);
    if (!item.readAt) {
      await api<{readAt:string}>(`/v1/me/notifications/${item.id}/read`, { method:'POST' }).then((result)=>setNotifications((current)=>current.map((notification)=>notification.id===item.id?{...notification,readAt:result.readAt}:notification))).catch(()=>undefined);
    }
    if (item.resourceType==='referral'&&item.resourceId&&item.facilityId) { setFacilityId(item.facilityId);setSection('referrals');setOpenReferralId(item.resourceId); }
  };
  if (!user) return <Login busy={busy} error={error} onSubmit={message(async () => {
    const form = new FormData(document.querySelector<HTMLFormElement>('#login')!);
    await api('/v1/auth/login', { method: 'POST', body: JSON.stringify({ email: form.get('email'), password: form.get('password'), client: 'web' }) });
    await refreshAuth();
  })} />;
  const allowed = role === 'RECEPTIONIST' || role === 'DOCTOR' || role === 'ADMIN';
  const navItems = [['overview', 'Visão geral', '⌂'], ['patients', 'Pacientes', '◉'], ['queue', 'Fila de atendimento', '≋']] as const;
  const visibleNavItems = role === 'ADMIN'
    ? [['capacity', 'Capacidade de lotação', '⚙'] as const]
    : allowed ? [...navItems, ['referrals', 'Encaminhamentos', '↗'] as const] : navItems;
  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#"><span>AtendeMed<small>saúde conectada</small></span></a>
      <div className="side-label">MENU PRINCIPAL</div>
      <nav>{visibleNavItems.map(([key, label, icon]) => <button key={key} className={`nav-item ${role === 'ADMIN' || section === key ? 'selected' : ''}`} onClick={() => setSection(key)}><span className="nav-icon">{icon}</span>{label}</button>)}</nav>
      <div className="side-bottom"><div className="online-dot"/> Ambiente de demonstração<br/><span>Dados fictícios</span></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="crumb">Operação <span>/</span> <span className="crumb-facility" title={facility?.name ?? 'Unidade'}>{facility?.name ?? 'Unidade'}</span></div><div className="top-actions"><div className="notification-control"><button className="notification-bell" aria-label={`Notificações${notifications.filter((item)=>!item.readAt).length?`, ${notifications.filter((item)=>!item.readAt).length} não lidas`:''}`} aria-expanded={notificationOpen} onClick={()=>setNotificationOpen((current)=>!current)}>♧{notifications.some((item)=>!item.readAt)&&<span>{notifications.filter((item)=>!item.readAt).length}</span>}</button>{notificationOpen&&<div className="notification-popover"><b>Notificações</b>{notifications.length===0?<p className="muted">Nenhuma notificação.</p>:notifications.map((item)=><button key={item.id} className={`notification-item ${item.readAt?'':'unread'}`} onClick={()=>void openNotification(item)}><strong>{item.title}</strong><span>{item.message}</span><small>{new Date(item.createdAt).toLocaleString('pt-BR')}</small></button>)}</div>}</div><select aria-label="Unidade ativa" value={facilityId} onChange={(event) => setFacilityId(event.target.value)}>{memberships.map((membership) => <option key={membership.facilityId} value={membership.facilityId}>{facilities.find((item) => item.id === membership.facilityId)?.name ?? 'Unidade'}</option>)}</select><div className="avatar">{user.name.slice(0, 1).toUpperCase()}</div><span className="user-name">{user.name}</span><button className="quiet-button" onClick={() => void logout()}>Sair</button></div></header>
      <div className="page-content">
        {(error || notice) && <div role="status" className={`toast ${error ? 'error' : ''}`}>{error || notice}<button onClick={() => { setError(''); setNotice(''); }}>×</button></div>}
        {!allowed ? <div className="empty-state"><h2>Acesso operacional indisponível</h2><p>Esta conta não possui vínculo ativo de médico ou atendente nesta unidade.</p></div> : role === 'ADMIN' ? <CapacitySettings facility={facility} busy={busy} onSaved={(occupancyCapacity) => { setFacilities((items) => items.map((item) => item.id === facilityId ? { ...item, occupancyCapacity } : item)); setNotice('Capacidade de lotação atualizada.'); }}/> : section === 'patients' ? <Patients facilityId={facilityId} busy={busy} act={message} setNotice={setNotice}/> : section === 'referrals' ? <ReferralWorkspace facilityId={facilityId} facilities={facilities} role={role!} openReferralId={openReferralId} onReferralOpened={setOpenReferralId} onAccepted={()=>setSection('queue')}/> : <Queue facilityId={facilityId} facilityName={facility?.name ?? 'Unidade'} facilityType={facility?.type ?? ''} occupancyCapacity={facility?.occupancyCapacity ?? null} role={role!} overview={section === 'overview'} busy={busy} act={message} setNotice={setNotice} goPatients={() => setSection('patients')} onOpenReferral={(id)=>{setSection('referrals');setOpenReferralId(id);}}/>}
      </div>
    </main>
  </div>;
}

export default App;
