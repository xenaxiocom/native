// xenaxio (step 151 B): notifications for a Xenaxio account come from the platform, not from
// Bulwark's relay. The phone hands its FCM token (Android) or APNs token (iPhone) to the
// platform with its own sign-in; the platform sends Rooms' notifications to it and stops
// when the phone signs out.
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { jmapClient } from '../api/jmap-client';
import { getFcmToken, requestNotificationPermission } from '../lib/push-notifications';
import { useAccountStore } from '../stores/account-store';
import { isXenaxioServerUrl } from './platform-sign-in';

export class XenaxioPushError extends Error {
  constructor(readonly reason: 'permission' | 'unavailable' | 'token' | 'refused') {
    super(`push_${reason}`);
    this.name = 'XenaxioPushError';
  }
}

/** Whether the account's notifications come from the Xenaxio platform. */
export function isXenaxioAccount(accountId: string | null | undefined): boolean {
  const entry = accountId ? useAccountStore.getState().getAccountById(accountId) : null;
  return !!entry && isXenaxioServerUrl(entry.serverUrl);
}

async function credentials(accountId: string): Promise<{ base: string; token: string }> {
  const entry = useAccountStore.getState().getAccountById(accountId);
  const token = (await jmapClient.getStoredCredentials(accountId))?.accessToken;
  if (!entry || !token || !isXenaxioServerUrl(entry.serverUrl)) throw new XenaxioPushError('unavailable');
  return { base: entry.serverUrl.replace(/\/+$/, ''), token };
}

/** Turns the platform's notifications on for this phone and account. */
export async function enableXenaxioPush(accountId: string, fetcher: typeof fetch = fetch): Promise<void> {
  const { base, token } = await credentials(accountId);
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  const offered = await fetcher(`${base}/mobile/push`, { headers });
  const transports = offered.ok ? ((await offered.json()) as { transports?: string[] }).transports ?? [] : [];
  const transport = Platform.OS === 'ios' ? 'apns' : 'fcm';
  if (!transports.includes(transport)) throw new XenaxioPushError('unavailable');
  if (!(await requestNotificationPermission())) throw new XenaxioPushError('permission');
  const device =
    transport === 'apns'
      ? await Notifications.getDevicePushTokenAsync().then((r) => (typeof r.data === 'string' ? r.data : null), () => null)
      : await getFcmToken();
  if (!device) throw new XenaxioPushError('token');
  const res = await fetcher(`${base}/mobile/push`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ transport, token: device }),
  });
  if (!res.ok) throw new XenaxioPushError('refused');
}

/** Turns them off again; best effort (signing the phone out ends them on the platform too). */
export async function disableXenaxioPush(accountId: string, fetcher: typeof fetch = fetch): Promise<void> {
  try {
    const { base, token } = await credentials(accountId);
    await fetcher(`${base}/mobile/push`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  } catch {
    // nothing to do
  }
}
