import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyDeviceSecret } from '../auth/device-secret.js';
import { DeviceTokens } from '../auth/device-tokens.js';
import { ANY_SECRET_HASH } from '../testing/fixtures.js';
import { InMemoryDeviceRepository } from '../testing/in-memory-device.repository.js';
import { unwrap } from '../testing/unwrap.js';
import { DevicesService } from './devices.service.js';

const clock = { now: () => Date.parse('2026-10-20T08:00:00Z') };

const setup = () => {
  const devices = new InMemoryDeviceRepository();
  const tokens = new DeviceTokens('une-clé-de-test-de-plus-de-32-caractères', clock);
  return { devices, tokens, service: new DevicesService(devices, tokens) };
};

describe('DevicesService', () => {
  it('enregistre un appareil avec un secret, dont il ne garde que l’empreinte', async () => {
    const { devices, service } = setup();

    const { deviceId, secret } = await service.register();

    const stored = await devices.secretHashOf(deviceId);
    expect(stored).toBeDefined();
    expect(stored).not.toContain(secret);
    expect(await verifyDeviceSecret(secret, stored ?? '')).toBe(true);
  });

  it('échange le bon secret contre un jeton qui atteste l’appareil et son compte', async () => {
    const { tokens, service } = setup();
    const { accountId, deviceId, secret } = await service.register();

    const issued = unwrap(await service.issueToken(deviceId, secret));

    expect(issued.expiresIn).toBe(900);
    expect(await tokens.verify(issued.token)).toEqual({ deviceId, accountId });
  });

  it('refuse un secret faux, un appareil inconnu ou sans secret, sans dire lequel', async () => {
    const { devices, service } = setup();
    const { deviceId, secret } = await service.register();
    const withoutValidSecret = (await devices.registerWithNewAccount(ANY_SECRET_HASH)).deviceId;
    const refused = { ok: false, error: { kind: 'InvalidCredentials' } };

    expect(await service.issueToken(deviceId, `${secret}x`)).toEqual(refused);
    expect(await service.issueToken(randomUUID(), secret)).toEqual(refused);
    expect(await service.issueToken(withoutValidSecret, secret)).toEqual(refused);
  });
});
