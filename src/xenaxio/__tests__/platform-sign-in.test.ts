import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as WebBrowser from 'expo-web-browser';
import {
  authorizeUrl,
  isXenaxioServerUrl,
  readCallback,
  signInWithXenaxio,
  signOutOfXenaxio,
  XenaxioSignInCancelledError,
  xenaxioOrigin,
} from '../platform-sign-in';

// Step 151 A: sign-in through the Xenaxio platform.
describe('the Xenaxio address', () => {
  it('takes a bare host, the default, and https only', () => {
    expect(xenaxioOrigin('acme.xenaxio.com')).toBe('https://acme.xenaxio.com');
    expect(xenaxioOrigin('https://acme.xenaxio.com/mail')).toBe('https://acme.xenaxio.com');
    expect(xenaxioOrigin('')).toBe('https://app.xenaxio.com');
    expect(() => xenaxioOrigin('http://acme.xenaxio.com')).toThrow();
    expect(() => xenaxioOrigin('https://user:pw@acme.xenaxio.com')).toThrow();
  });

  it('knows its accounts by the /api base', () => {
    expect(isXenaxioServerUrl('https://app.xenaxio.com/api')).toBe(true);
    expect(isXenaxioServerUrl('https://mail.example.com')).toBe(false);
    expect(isXenaxioServerUrl('http://app.xenaxio.com/api')).toBe(false);
  });
});

describe('the callback link', () => {
  const origin = 'https://app.xenaxio.com';
  it('is believed only with its state and for its address', () => {
    expect(readCallback(`xenaxio://auth/callback?code=c1&state=s1&origin=${encodeURIComponent(origin)}`, 's1', origin)).toBe('c1');
    expect(() => readCallback(`xenaxio://auth/callback?code=c1&state=other&origin=${encodeURIComponent(origin)}`, 's1', origin)).toThrow(/state_mismatch/);
    expect(() => readCallback('xenaxio://auth/callback?code=c1&state=s1&origin=https%3A%2F%2Fevil.example', 's1', origin)).toThrow(/origin_mismatch/);
    expect(() => readCallback(`xenaxio://auth/callback?state=s1&origin=${encodeURIComponent(origin)}`, 's1', origin)).toThrow(/no_code/);
  });
});

describe('signing in', () => {
  beforeEach(() => {
    vi.mocked(WebBrowser.openAuthSessionAsync).mockReset();
  });

  it('opens the authorize page with PKCE, exchanges the code and returns the /api base and the token', async () => {
    let asked = '';
    vi.mocked(WebBrowser.openAuthSessionAsync).mockImplementation(async (url: string) => {
      asked = url;
      const state = new URL(url).searchParams.get('state') as string;
      return { type: 'success', url: `xenaxio://auth/callback?code=the-code&state=${state}&origin=${encodeURIComponent('https://acme.xenaxio.com')}` } as never;
    });
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({ code: 'the-code', platform: expect.stringMatching(/^(ios|android)$/) });
      expect(body.code_verifier).toMatch(/^[A-Za-z0-9_-]{43,}$/);
      return new Response(JSON.stringify({ token: 'device-token', origin: 'https://acme.xenaxio.com', user: { email: 'max@acme.de', displayName: 'Max' }, tenant: { name: 'Acme' } }), { status: 200 });
    });
    const result = await signInWithXenaxio('acme.xenaxio.com', { fetch: fetcher as unknown as typeof fetch });
    const parsed = new URL(asked);
    expect(`${parsed.origin}${parsed.pathname}`).toBe('https://acme.xenaxio.com/api/mobile/authorize');
    expect(parsed.searchParams.get('redirect_uri')).toBe('xenaxio://auth/callback');
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
    expect(fetcher).toHaveBeenCalledWith('https://acme.xenaxio.com/api/mobile/token', expect.anything());
    expect(result).toEqual({ serverUrl: 'https://acme.xenaxio.com/api', token: 'device-token', email: 'max@acme.de', displayName: 'Max', company: 'Acme' });
    expect(authorizeUrl('https://a.test', 's', 'c')).toContain('code_challenge=c');
  });

  it('a closed browser is a cancellation, not an error', async () => {
    vi.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValue({ type: 'cancel' } as never);
    await expect(signInWithXenaxio('app.xenaxio.com')).rejects.toBeInstanceOf(XenaxioSignInCancelledError);
  });

  it('signing out tells the platform with the token, for Xenaxio accounts only', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 200 }));
    await signOutOfXenaxio('https://acme.xenaxio.com/api', 'device-token', fetcher as unknown as typeof fetch);
    expect(fetcher).toHaveBeenCalledWith('https://acme.xenaxio.com/api/mobile/logout', { method: 'POST', headers: { Authorization: 'Bearer device-token' } });
    await signOutOfXenaxio('https://mail.example.com', 't', fetcher as unknown as typeof fetch);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
