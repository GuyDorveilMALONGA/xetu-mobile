import 'expo-sqlite/localStorage/install';

const DEVICE_ID_KEY = 'xetu.device_id.v1';

function makeUuidV4(): string {
  const randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  if (randomUUID) {
    return randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    const next = char === 'x' ? value : (value & 0x3) | 0x8;
    return next.toString(16);
  });
}

export function getDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing) {
    return existing;
  }

  const deviceId = makeUuidV4();
  localStorage.setItem(DEVICE_ID_KEY, deviceId);
  return deviceId;
}

export function getPhoneSurrogate(deviceId: string): string {
  return `mob_${deviceId.replace(/-/g, '').slice(0, 12)}`;
}
