import React from 'react';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import Constants from 'expo-constants';
import { Platform, Text, View } from 'react-native';
import { styles } from '../styles';
import type { Facility } from '../types';

export function FacilityMap({ mapped, mapsEnabled }: { mapped: Facility[]; mapsEnabled: boolean }) {
  return <MapView style={styles.map} provider={Platform.OS === 'ios' && Constants.appOwnership === 'expo' ? undefined : mapsEnabled ? PROVIDER_GOOGLE : undefined} initialRegion={{ latitude: mapped[0].latitude!, longitude: mapped[0].longitude!, latitudeDelta: 0.12, longitudeDelta: 0.12 }}>
    {mapped.map((item) => <Marker key={item.id} coordinate={{ latitude: item.latitude!, longitude: item.longitude! }} title={item.name} description={`${item.occupancy?.active ?? 0}/${item.occupancyCapacity ?? '—'} pessoas`}><View style={styles.marker}><Text style={styles.markerText}>{item.type} {item.occupancy?.active ?? 0}/{item.occupancyCapacity ?? '—'}</Text></View></Marker>)}
  </MapView>;
}
