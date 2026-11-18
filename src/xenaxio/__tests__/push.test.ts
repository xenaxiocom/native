import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Platform } from 'react-native';

// Step 151 B: a Xenaxio account's notifications come from the platform.
const state = vi.hoisted(() => ({ entry: null as null | { serverUrl: string }, token: 'device-token' as string | null }));
vi.mock('../../stores/account-store', () => ({ useAccountStore: { getState: () => ({ getAccountById: () => state.entry }) } }));
vi.mock('../../api/jmap-client', () => ({ jmapClient: { getStoredCredentials: async () => (state.token ? { accessToken: state.token } : null) } }));
vi.mock('../../lib/push-notifications', () => ({ getFcmToken: async () => 'fcm-token-0123456789', requestNotificationPermission: async () => true }));

const { enableXenaxioPush, isXenaxioAccount, XenaxioPushError } = await import('../push');

describe('Xenaxio push', () => {
  beforeEach(() => {
    state.entry = { serverUrl: 'https://acme.xenaxio.com/api' };
    state.token = 'device-token';
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
  });

  it('knows its accounts', () => {
    expect(isXenaxioAccount('a')).toBe(true);
    state.entry = { serverUrl: 'https://mail.example.com' };
    expect(isXenaxioAccount('a')).toBe(false);
  });

  it('hands the FCM token to the platform with the phone\'s sign-in', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(init?.method === 'POST' ? { ok: true } : { transports: ['fcm', 'apns'] }), { status: 200 });
    }) as unknown as typeof fetch;
    await enableXenaxioPush('a', fetcher);
    expect(calls[1]?.url).toBe('https://acme.xenaxio.com/api/mobile/push');
    expect(calls[1]?.init?.headers).toMatchObject({ Authorization: 'Bearer device-token' });
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({ transport: 'fcm', token: 'fcm-token-0123456789' });
  });

  it('says so when the platform has no push for this kind of phone', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ transports: ['apns'] }), { status: 200 })) as unknown as typeof fetch;
    await expect(enableXenaxioPush('a', fetcher)).rejects.toBeInstanceOf(XenaxioPushError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
