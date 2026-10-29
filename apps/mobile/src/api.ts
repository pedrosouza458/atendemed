import { Platform } from 'react-native';

export const baseUrl = (process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
export const green = '#177862';
export const occupancyLabel = (status?: string) => status === 'FULL' ? 'No limite' : status === 'HIGH' ? 'Movimento alto' : status === 'NORMAL' ? 'Normal' : 'Lotação não informada';
export const date = (value: string) => new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
export class HttpError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }

export async function request<T>(path: string, token?: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(Platform.OS === 'web' ? { 'X-Atende-Request': '1' } : {}), ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new HttpError(response.status, data.error || 'REQUEST_FAILED', data.message || 'Não foi possível concluir a solicitação.');
  return data as T;
}
