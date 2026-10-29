import React from 'react';
import { Text, View } from 'react-native';
import type { Facility } from '../types';

export function FacilityMap({ mapped }: { mapped: Facility[]; mapsEnabled: boolean }) {
  const latitudes = mapped.map((item) => item.latitude!);
  const longitudes = mapped.map((item) => item.longitude!);
  const north = Math.max(...latitudes); const south = Math.min(...latitudes);
  const east = Math.max(...longitudes); const west = Math.min(...longitudes);
  return <View accessibilityLabel="Mapa ilustrativo de UPAs e postos" style={{ height: 310, borderRadius: 16, overflow: 'hidden', backgroundColor: '#e9f1ec', position: 'relative', borderWidth: 1, borderColor: '#d8e5dc' }}>
    <View style={{ position: 'absolute', left: '8%', top: '33%', width: '90%', height: 12, backgroundColor: '#fff', transform: [{ rotate: '-13deg' }] }}/>
    <View style={{ position: 'absolute', left: '12%', top: '71%', width: '88%', height: 10, backgroundColor: '#fff', transform: [{ rotate: '18deg' }] }}/>
    <View style={{ position: 'absolute', left: '46%', top: '-7%', width: 11, height: 355, backgroundColor: '#fff', transform: [{ rotate: '27deg' }] }}/>
    <Text style={{ position: 'absolute', left: 14, top: 12, color: '#476a5f', fontSize: 12, fontWeight: '700' }}>Mapa ilustrativo · unidades fictícias</Text>
    {mapped.map((item) => {
      const x = 8 + ((item.longitude! - west) / (east - west || 1)) * 60;
      const y = 16 + ((north - item.latitude!) / (north - south || 1)) * 58;
      return <View key={item.id} style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, width: 124, padding: 8, borderRadius: 10, backgroundColor: '#177862' }}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 11 }}>{item.name.replace(' (fictícia)', '')}</Text>
        <Text style={{ color: '#fff', fontSize: 11 }}>{item.occupancy?.active ?? 0}/{item.occupancyCapacity ?? '—'} pessoas</Text>
      </View>;
    })}
  </View>;
}
