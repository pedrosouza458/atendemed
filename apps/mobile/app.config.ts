import type { ExpoConfig } from 'expo/config';

const googleMapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY;
const config: ExpoConfig = {
  name: 'Atende', slug: 'atende', scheme: 'atende', version: '0.1.0', orientation: 'portrait',
  userInterfaceStyle: 'light',
  plugins: ['expo-router', 'expo-secure-store', 'expo-document-picker',
    ...(googleMapsKey ? [['react-native-maps', { iosGoogleMapsApiKey: googleMapsKey, androidGoogleMapsApiKey: googleMapsKey }] as [string, Record<string, string>]] : [])],
  ios: { supportsTablet: true, bundleIdentifier: 'com.atende.paciente' },
  android: { package: 'com.atende.paciente' },
  extra: { googleMapsEnabled: Boolean(googleMapsKey) },
};
export default config;
