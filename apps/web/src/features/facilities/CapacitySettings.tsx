import React, { useEffect, useState } from 'react';
import { api } from '../../api';
import type { Facility } from '../../types';

export function CapacitySettings({ facility, busy, onSaved }: {
  facility: Facility | undefined;
  busy: boolean;
  onSaved: (capacity: number) => void;
}) {
  const [capacity, setCapacity] = useState('');
  useEffect(() => setCapacity(facility?.occupancyCapacity ? String(facility.occupancyCapacity) : ''), [facility?.id, facility?.occupancyCapacity]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!facility) return;
    const occupancyCapacity = Number(capacity);
    const result = await api<{ occupancyCapacity: number }>(`/v1/facilities/${facility.id}/occupancy-capacity`, {
      method: 'PATCH', body: JSON.stringify({ occupancyCapacity }),
    });
    onSaved(result.occupancyCapacity);
  };

  if (!facility || !['UBS', 'UPA', 'CLINIC'].includes(facility.type)) {
    return <div className="empty-state"><h2>Lotação disponível para UBS, UPA e clínica</h2><p>Selecione uma dessas unidades para configurar a capacidade de referência.</p></div>;
  }

  return <>
    <div className="page-heading"><div><p className="eyebrow">CONFIGURAÇÃO DA UNIDADE</p><h1>Capacidade de lotação</h1><p className="muted">Defina quantas pessoas a unidade consegue acomodar ao mesmo tempo.</p></div></div>
    <section className="panel capacity-settings">
      <div><p className="eyebrow">{facility.type}</p><h2>{facility.name}</h2><p className="muted">{facility.type === 'CLINIC' ? 'O indicador considera as pessoas aguardando ou em atendimento na fila da clínica.' : 'O indicador considera as chegadas ativas registradas pela recepção.'}</p></div>
      <form onSubmit={(event) => void save(event)}>
        <label htmlFor="occupancy-capacity">Capacidade máxima de referência</label>
        <div className="capacity-input-row"><input id="occupancy-capacity" type="number" min="1" max="10000" step="1" required value={capacity} onChange={(event) => setCapacity(event.target.value)} placeholder="Ex.: 80"/><span>pessoas</span></div>
        <small>Com 70% da capacidade, a lotação passa a “Movimento alto”. Ao atingir o limite, passa a “No limite”.</small>
        <button className="primary-button" disabled={busy || !capacity}>Salvar capacidade <span>→</span></button>
      </form>
    </section>
  </>;
}
