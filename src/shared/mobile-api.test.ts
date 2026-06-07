import { describe, expect, it } from 'vitest';
import {
  createExpoGoPairingUrl,
  createMobilePairingUrl,
  parseMobilePairingUrl,
} from './mobile-api';

describe('mobile pairing links', () => {
  it('round-trips a gateway connection through the mobile deep link', () => {
    const connection = {
      baseUrl: 'http://192.168.1.10:3879',
      token: 'mobile-token',
    };

    const url = createMobilePairingUrl(connection);

    expect(url).toBe(
      'yodamobile://connect?baseUrl=http%3A%2F%2F192.168.1.10%3A3879&token=mobile-token'
    );
    expect(parseMobilePairingUrl(url)).toEqual(connection);
  });

  it('round-trips a gateway connection through the Expo Go local URL', () => {
    const connection = {
      baseUrl: 'http://192.168.1.10:3879',
      token: 'mobile-token',
    };

    const url = createExpoGoPairingUrl('exp://192.168.1.10:8081', connection);

    expect(url).toBe(
      'exp://192.168.1.10:8081/--/connect?baseUrl=http%3A%2F%2F192.168.1.10%3A3879&token=mobile-token'
    );
    expect(parseMobilePairingUrl(url)).toEqual(connection);
  });

  it('parses Expo Go local URLs after exp is normalized to http', () => {
    const connection = {
      baseUrl: 'http://192.168.1.10:3879',
      token: 'mobile-token',
    };

    expect(
      parseMobilePairingUrl(
        'http://192.168.1.10:8081/--/connect?baseUrl=http%3A%2F%2F192.168.1.10%3A3879&token=mobile-token'
      )
    ).toEqual(connection);
  });

  it('rejects invalid pairing links', () => {
    expect(parseMobilePairingUrl('https://lovstudio.ai/yoda/mobile')).toBeNull();
    expect(
      parseMobilePairingUrl('yodamobile://connect?baseUrl=http%3A%2F%2F192.168.1.10%3A3879')
    ).toBeNull();
    expect(parseMobilePairingUrl('not a url')).toBeNull();
  });
});
