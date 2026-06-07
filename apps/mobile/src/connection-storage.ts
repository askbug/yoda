import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MobileConnection } from './api-client';

const STORAGE_KEY = 'yoda.mobile.connection.v1';

export async function loadConnection(): Promise<MobileConnection | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<MobileConnection>;
    if (!parsed.baseUrl || !parsed.token) return null;
    return {
      baseUrl: parsed.baseUrl,
      token: parsed.token,
    };
  } catch {
    return null;
  }
}

export function saveConnection(connection: MobileConnection): Promise<void> {
  return AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(connection));
}

export function clearConnection(): Promise<void> {
  return AsyncStorage.removeItem(STORAGE_KEY);
}
