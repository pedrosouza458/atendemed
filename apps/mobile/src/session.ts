import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const key = 'atende_session';
const webKey = 'atende_patient_session';

export function readSession(): Promise<string | null> {
  if (Platform.OS !== 'web') return SecureStore.getItemAsync(key);
  return Promise.resolve(typeof window === 'undefined' ? null : window.sessionStorage.getItem(webKey));
}

export function saveSession(token: string): Promise<void> {
  if (Platform.OS !== 'web') return SecureStore.setItemAsync(key, token);
  if (typeof window !== 'undefined') window.sessionStorage.setItem(webKey, token);
  return Promise.resolve();
}

export function deleteSession(): Promise<void> {
  if (Platform.OS !== 'web') return SecureStore.deleteItemAsync(key);
  if (typeof window !== 'undefined') window.sessionStorage.removeItem(webKey);
  return Promise.resolve();
}
