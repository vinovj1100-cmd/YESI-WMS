import { db, type ConnectedDevice } from './db';

export function getDeviceId(): string {
  const key = 'vortex_device_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = `DEV-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    localStorage.setItem(key, id);
  }
  return id;
}

export function getDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows/i.test(ua)) return 'Windows PC';
  if (/Mac/i.test(ua)) return 'Mac';
  return 'Browser';
}

export async function registerDeviceHeartbeat(operator: string): Promise<void> {
  const deviceId = getDeviceId();
  const existing = await db.connectedDevices.where('deviceId').equals(deviceId).first();

  const record: ConnectedDevice = {
    deviceId,
    deviceName: getDeviceName(),
    platform: navigator.platform,
    userAgent: navigator.userAgent.slice(0, 120),
    operator,
    lastSeen: new Date().toISOString(),
    isOnline: navigator.onLine,
    activeWorkflows: 0,
    registeredAt: existing?.registeredAt || new Date().toISOString(),
  };

  if (existing?.id) {
    await db.connectedDevices.update(existing.id, record);
  } else {
    await db.connectedDevices.add(record);
  }
}

export async function getOnlineDevices(): Promise<ConnectedDevice[]> {
  const devices = await db.connectedDevices.toArray();
  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  return devices.map((d) => ({
    ...d,
    isOnline: new Date(d.lastSeen).getTime() > fiveMinAgo,
  }));
}