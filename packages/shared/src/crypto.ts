const iterations = 600_000;
const encoder = new TextEncoder();

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const fromBase64url = (value: string) => Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), (char) => char.charCodeAt(0));
const hex = (bytes: Uint8Array) => Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');

async function derive(password: string, salt: Uint8Array, count: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(salt), iterations: count }, key, 256));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${iterations}$${base64url(salt)}$${base64url(await derive(password, salt, iterations))}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, countText, saltText, expectedText] = encoded.split('$');
  const count = Number(countText);
  if (algorithm !== 'pbkdf2-sha256' || !Number.isInteger(count) || count < 600_000 || count > 2_000_000 || !saltText || !expectedText) return false;
  let expected: Uint8Array;
  let salt: Uint8Array;
  try { salt = fromBase64url(saltText); expected = fromBase64url(expectedText); } catch { return false; }
  if (salt.length !== 16 || expected.length !== 32) return false;
  const actual = await derive(password, salt, count);
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= expected[i]! ^ actual[i]!;
  return difference === 0;
}

export function randomToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function tokenHash(token: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(token))));
}
