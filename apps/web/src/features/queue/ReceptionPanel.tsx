import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import type { Arrival, CheckInResult, Doctor, Occupancy, Patient, Ticket } from '../../types';

export function ReceptionPanel({ facilityId, facilityName, facilityType, occupancyCapacity, busy, act, setNotice, goPatients, onQueueChange }: { facilityId: string; facilityName: string; facilityType: string; occupancyCapacity: number | null; busy: boolean; act: (action: () => Promise<void>) => (event: React.FormEvent) => void; setNotice: (message: string) => void; goPatients: () => void; onQueueChange: () => Promise<void> }) {
  const tracksOccupancy = facilityType === 'UBS' || facilityType === 'UPA';
  const showsOccupancy = tracksOccupancy || facilityType === 'CLINIC';
  const [arrivals, setArrivals] = useState<Arrival[]>([]); const [occupancy, setOccupancy] = useState<Occupancy | null>(null);
  const [query, setQuery] = useState(''); const [patients, setPatients] = useState<Patient[]>([]); const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null); const [hasSearched, setHasSearched] = useState(false);
  const [ticketCode, setTicketCode] = useState('');
  const [doctors, setDoctors] = useState<Doctor[]>([]); const [doctorId, setDoctorId] = useState(''); const [doctorsLoaded, setDoctorsLoaded] = useState(false);
  const [department, setDepartment] = useState(facilityType === 'UPA' ? 'Urgência' : facilityType === 'UBS' ? 'Atendimento geral' : 'Clínica geral');
  const load = useCallback(async () => {
    if (!showsOccupancy) { setArrivals([]); setOccupancy(null); return; }
    const [active, current] = await Promise.all([tracksOccupancy ? api<{ arrivals: Arrival[] }>(`/v1/facilities/${facilityId}/arrivals`) : Promise.resolve({ arrivals: [] }), api<{ occupancy: Occupancy }>(`/v1/facilities/${facilityId}/occupancy`)]);
    setArrivals(active.arrivals); setOccupancy(current.occupancy);
  }, [facilityId, showsOccupancy, tracksOccupancy]);
  useEffect(() => { void load(); const timer = window.setInterval(() => { void load(); }, 15000); return () => window.clearInterval(timer); }, [load]);
  useEffect(() => {
    let active = true;
    setDoctors([]); setDoctorId(''); setDoctorsLoaded(false);
    void api<{ doctors: Doctor[] }>(`/v1/facilities/${facilityId}/doctors`).then((result) => { if (active) setDoctors(result.doctors); })
      .catch(() => { if (active) setDoctors([]); }).finally(() => { if (active) setDoctorsLoaded(true); });
    return () => { active = false; };
  }, [facilityId]);
  const searchPatient = async () => {
    setSelectedPatient(null); setTicketCode('');
    const cpf = query.replace(/\D/g, '');
    if (cpf.length !== 11) throw new Error('Informe um CPF com 11 dígitos.');
    const results = (await api<{ results: Patient[] }>(`/v1/patients?query=${cpf}`, { headers: { 'X-Facility-Id': facilityId } })).results;
    setPatients(results); setHasSearched(true);
  };
  const registerArrival = async () => {
    if (!selectedPatient) return;
    if (tracksOccupancy) {
      const result = await api<CheckInResult>(`/v1/facilities/${facilityId}/check-ins`, { method: 'POST', body: JSON.stringify({ cpf: query.replace(/\D/g, ''), department, doctorId }) });
      setTicketCode(result.ticket.code);
      setNotice(result.arrival.notified ? `Chegada registrada. Código ${result.ticket.code} enviado à conta do paciente.` : `Chegada registrada. Código ${result.ticket.code} pronto para imprimir.`);
    } else {
      const result = await api<Ticket>('/v1/queue-tickets', { method: 'POST', headers: { 'X-Facility-Id': facilityId }, body: JSON.stringify({ patientId: selectedPatient.id, department, doctorId }) });
      setTicketCode(result.code);
      setNotice(`Atendimento registrado. Código ${result.code} pronto para imprimir.`);
    }
    await Promise.all([load(), onQueueChange()]);
  };
  const labels = { NORMAL: 'Normal', HIGH: 'Movimento alto', FULL: 'No limite', UNKNOWN: 'Lotação não informada' };
  const unitDepartments=facilityType==='UPA'?['Urgência','Emergência']:facilityType==='UBS'?['Atendimento geral','Enfermagem','Vacinação']:facilityType==='DIAGNOSTIC_CENTER'?['Exames e diagnóstico','Tomografia','Radiologia']:['Clínica geral','Atendimento especializado','Exames e diagnóstico'];
  return <><section className="panel issue-panel reception-panel"><p className="eyebrow">RECEPÇÃO · {facilityType.replaceAll('_',' ')}</p><h3>{tracksOccupancy?'Registrar chegada':'Novo atendimento'}</h3><p className="task-help">Busque pelo CPF e escolha o setor e o médico. {tracksOccupancy?'A confirmação cria um único código de atendimento e atualiza a lotação.':'A confirmação coloca a pessoa na fila do médico escolhido e gera um código para impressão.'}</p>
    <form className="compact-form arrival-search-form" onSubmit={act(searchPatient)}><label>CPF do paciente<input value={query} onChange={(event)=>{setQuery(event.target.value);setHasSearched(false);setPatients([]);setSelectedPatient(null);setTicketCode('');}} inputMode="numeric" maxLength={14} placeholder="000.000.000-00" required/></label><button disabled={busy} className="secondary-button full">Buscar paciente</button></form>
    {patients.length > 0 && <div className="arrival-patient-results">{patients.map((patient)=><button type="button" key={patient.id} className={`select-patient ${selectedPatient?.id===patient.id?'patient-selected':''}`} onClick={()=>setSelectedPatient(patient)}><b>{patient.fullName}</b><small>Nascimento {new Date(`${patient.birthDate}T00:00:00`).toLocaleDateString('pt-BR')}</small></button>)}</div>}
    {hasSearched&&patients.length===0&&<div className="quiet-empty compact">Paciente não encontrado. <button className="text-button" type="button" onClick={goPatients}>Cadastrar paciente</button></div>}
    {selectedPatient&&!ticketCode&&<div className="reception-action"><div><b>{selectedPatient.fullName}</b><small>Confirme para colocar a pessoa na fila do médico e setor escolhidos.</small></div><form className="ticket-issue-form" onSubmit={act(registerArrival)}><label className="doctor-select-label">Médico responsável<select required aria-label="Médico responsável" value={doctorId} onChange={(event)=>setDoctorId(event.target.value)}><option value="">{doctorsLoaded?'Selecione o médico':'Carregando médicos…'}</option>{doctors.map((doctor)=><option key={doctor.id} value={doctor.id}>{doctor.name}{doctor.specialties.length?` · ${doctor.specialties.join(', ')}`:''}</option>)}</select></label><label className="doctor-select-label">Setor<select aria-label="Setor de atendimento" value={department} onChange={(event)=>setDepartment(event.target.value)}>{unitDepartments.map(item=><option key={item}>{item}</option>)}</select></label><button disabled={busy||!doctorId} className="secondary-button">{tracksOccupancy?'Registrar chegada':'Criar atendimento'}</button></form>{doctorsLoaded&&doctors.length===0&&<small className="muted">Nenhum médico habilitado nesta unidade.</small>}</div>}
    {ticketCode&&<div className="check-in-result single-ticket"><div><span>CÓDIGO DO ATENDIMENTO</span><strong>{ticketCode}</strong><small>Aguarde ser chamado para o setor escolhido.</small></div><p>Médico responsável: <b>{doctors.find((doctor)=>doctor.id===doctorId)?.name ?? '—'}</b></p><button type="button" className="secondary-button full" onClick={()=>window.print()}>Imprimir código</button></div>}
    {showsOccupancy&&<div className="occupancy-summary"><p className="eyebrow">LOTAÇÃO ATUAL</p><div className={`occupancy-state occupancy-${occupancy?.status?.toLowerCase() ?? 'unknown'}`}>{labels[occupancy?.status ?? 'UNKNOWN']}</div><p className="occupancy-foot">{occupancy?.active ?? 0} pessoas {facilityType === 'CLINIC' ? 'aguardando ou em atendimento' : 'na unidade'}{occupancyCapacity ? ` · referência ${occupancyCapacity}` : ''}</p><small className="muted">{occupancy?.updatedAt ? `Atualizado ${new Date(occupancy.updatedAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}` : 'Sem movimentação hoje'}</small></div>}
    {tracksOccupancy&&arrivals.length>0&&<details className="arrival-issue-details"><summary>Chegadas ativas · encerrar ao sair</summary><div className="arrival-list">{arrivals.map((arrival)=><form key={arrival.id} onSubmit={act(async()=>{await api(`/v1/facilities/${facilityId}/arrivals/${arrival.id}/close`,{method:'POST'});setNotice(`Chegada de ${arrival.patientName ?? 'paciente'} encerrada.`);await load();})}><b>{arrival.patientName ?? 'Cadastro anterior'}</b><small>{new Date(arrival.issuedAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</small><button className="row-action" disabled={busy}>Encerrar</button></form>)}</div></details>}
    </section><div className="print-slip"><h1>Atende</h1><p>Código de atendimento</p><strong>{ticketCode}</strong><p>{facilityName}</p><small>Aguarde ser chamado no setor e pelo médico escolhidos.</small></div></>;
}
