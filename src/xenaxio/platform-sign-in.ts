// xenaxio (step 151 A): sign-in through the Xenaxio platform.
//
// The phone's browser opens /api/mobile/authorize on the Xenaxio address (PKCE): the person
// signs in there as on the web (password, second factor), and the platform hands a one-time
// code back to the app through xenaxio://auth/callback. The app exchanges it for a token of
// its own (POST /api/mobile/token) and uses it as a Bearer token for everything under /api,
// JMAP included (`<address>/api/jmap/session`). The password never reaches the app.
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { createHandoffPkce } from '../lib/oauth';
import { randomHex } from '../lib/random';

export const XENAXIO_DEFAULT_ADDRESS = 'https://app.xenaxio.com';
export const XENAXIO_REDIRECT_URI = 'xenaxio://auth/callback';

export class XenaxioSignInCancelledError extends Error {
  constructor() {
    super('Sign-in cancelled');
    this.name = 'XenaxioSignInCancelledError';
  }
}

export class XenaxioSignInError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'XenaxioSignInError';
  }
}

export interface XenaxioSignIn {
  /** The JMAP and API base for this account: `<origin>/api`. */
  serverUrl: string;
  token: string;
  email: string;
  displayName: string;
  company: string;
}

/** `acme.xenaxio.com`, `https://acme.xenaxio.com/…` → `https://acme.xenaxio.com`; https only. */
export function xenaxioOrigin(address: string): string {
  const raw = address.trim() || XENAXIO_DEFAULT_ADDRESS;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new XenaxioSignInError('invalid_address');
  }
  if (url.protocol !== 'https:' || url.username || url.password) throw new XenaxioSignInError('invalid_address');
  return url.origin;
}

// The state is what stops a forged xenaxio:// link: from the platform CSPRNG.
function randomState(): string {
  return randomHex(16);
}

/** How the phone names itself in the person's device list. */
export function deviceName(): string {
  const model = (Platform.constants as { Model?: string; model?: string } | undefined)?.Model ?? (Platform.constants as { model?: string } | undefined)?.model;
  if (Platform.OS === 'ios') return model && /iPad/i.test(model) ? 'iPad' : 'iPhone';
  return model ? String(model).slice(0, 100) : 'Android';
}

export function authorizeUrl(origin: string, state: string, challenge: string): string {
  const query = new URLSearchParams({ redirect_uri: XENAXIO_REDIRECT_URI, state, code_challenge: challenge, code_challenge_method: 'S256' });
  return `${origin}/api/mobile/authorize?${query.toString()}`;
}

/**
 * The code from the callback link, believed only with this sign-in's state and only for
 * the address the browser was sent to.
 */
export function readCallback(url: string, state: string, origin: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new XenaxioSignInError('invalid_callback');
  }
  if (parsed.searchParams.get('state') !== state) throw new XenaxioSignInError('state_mismatch');
  const error = parsed.searchParams.get('error');
  if (error) throw new XenaxioSignInError(error);
  if (parsed.searchParams.get('origin') !== origin) throw new XenaxioSignInError('origin_mismatch');
  const code = parsed.searchParams.get('code');
  if (!code) throw new XenaxioSignInError('no_code');
  return code;
}

export async function signInWithXenaxio(address: string, opts: { addAccount?: boolean; fetch?: typeof fetch } = {}): Promise<XenaxioSignIn> {
  const origin = xenaxioOrigin(address);
  const state = randomState();
  const pkce = createHandoffPkce();
  // Adding an account: on iOS, the browser's cookies stay out, so the signed-in person
  // can't come back as the "new" one.
  const result = await WebBrowser.openAuthSessionAsync(authorizeUrl(origin, state, pkce.challenge), XENAXIO_REDIRECT_URI, opts.addAccount ? { preferEphemeralSession: true } : undefined);
  if (result.type === 'cancel' || result.type === 'dismiss') throw new XenaxioSignInCancelledError();
  if (result.type !== 'success' || !result.url) throw new XenaxioSignInError(`browser_${result.type}`);
  const code = readCallback(result.url, state, origin);

  const res = await (opts.fetch ?? fetch)(`${origin}/api/mobile/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ code, code_verifier: pkce.verifier, device_name: deviceName(), platform: Platform.OS === 'ios' ? 'ios' : 'android' }),
  });
  if (!res.ok) throw new XenaxioSignInError(res.status === 400 ? 'code_refused' : `token_${res.status}`);
  const body = (await res.json()) as { token?: string; origin?: string; user?: { email?: string; displayName?: string }; tenant?: { name?: string } };
  if (!body.token || body.origin !== origin) throw new XenaxioSignInError('token_answer');
  return { serverUrl: `${origin}/api`, token: body.token, email: body.user?.email ?? '', displayName: body.user?.displayName ?? '', company: body.tenant?.name ?? '' };
}

/** A Xenaxio account's base address (`https://…/api`), as stored for the account. */
export function isXenaxioServerUrl(serverUrl: string): boolean {
  try {
    const url = new URL(serverUrl);
    return url.protocol === 'https:' && url.pathname.replace(/\/+$/, '') === '/api';
  } catch {
    return false;
  }
}

/** Signs this phone out at the platform; its mail access ends there too. Best effort. */
export async function signOutOfXenaxio(serverUrl: string, token: string, fetcher: typeof fetch = fetch): Promise<void> {
  if (!isXenaxioServerUrl(serverUrl)) return;
  try {
    await fetcher(`${serverUrl.replace(/\/+$/, '')}/mobile/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  } catch {
    // Offline: the platform still ends the session when it expires, or from the web.
  }
}
