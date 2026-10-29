import React from 'react';
import { ScrollView, Text, TextInput } from 'react-native';
import { styles } from '../styles';

type Props = {
  authMode: 'login' | 'register'; name: string; setName: (value: string) => void;
  email: string; setEmail: (value: string) => void; password: string; setPassword: (value: string) => void;
  error: string; button: (label: string, onPress: () => void, secondary?: boolean) => React.ReactNode;
  login: () => void; setAuthMode: (value: 'login' | 'register') => void;
};

export function PatientAuth({ authMode, name, setName, email, setEmail, password, setPassword, error, button, login, setAuthMode }: Props) {
  return <ScrollView contentContainerStyle={styles.content}><Text style={styles.brand}>atende</Text><Text style={styles.title}>{authMode === 'register' ? 'Criar conta' : 'Bem-vindo ao seu cuidado'}</Text><Text style={styles.sub}>Acesse sua jornada de saúde com segurança.</Text>{authMode === 'register' && <TextInput style={styles.input} placeholder="Nome completo" value={name} onChangeText={setName} autoComplete="name"/>}<TextInput style={styles.input} placeholder="E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email"/><TextInput style={styles.input} placeholder="Senha" value={password} onChangeText={setPassword} secureTextEntry autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}/>{button(authMode === 'register' ? 'Criar conta' : 'Entrar', login)}{button(authMode === 'register' ? 'Já tenho conta' : 'Criar conta', () => setAuthMode(authMode === 'register' ? 'login' : 'register'), true)}{error ? <Text style={styles.error}>{error}</Text> : null}</ScrollView>;
}
