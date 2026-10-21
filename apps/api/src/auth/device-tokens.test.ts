import { SignJWT, UnsecuredJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { DeviceTokens } from './device-tokens.js';

const SECRET = 'une-clé-de-test-de-plus-de-32-caractères';
const CLAIMS = {
  deviceId: '6f1c2a3e-0000-4000-8000-000000000001',
  accountId: '6f1c2a3e-0000-4000-8000-000000000002',
};
const NOW = Date.parse('2026-10-20T08:00:00Z');

const tokensAt = (now: number, secret = SECRET) => new DeviceTokens(secret, { now: () => now });

describe('DeviceTokens', () => {
  it('émet un jeton qui redonne l’appareil et son compte, valable 15 minutes', async () => {
    const issued = await tokensAt(NOW).issue(CLAIMS);

    expect(issued.expiresIn).toBe(900);
    expect(await tokensAt(NOW).verify(issued.token)).toEqual(CLAIMS);
    expect(await tokensAt(NOW + 899_000).verify(issued.token)).toEqual(CLAIMS);
  });

  it('refuse un jeton expiré', async () => {
    const { token } = await tokensAt(NOW).issue(CLAIMS);

    expect(await tokensAt(NOW + 901_000).verify(token)).toBeUndefined();
  });

  it('refuse un jeton dont le contenu a été modifié', async () => {
    const { token } = await tokensAt(NOW).issue(CLAIMS);
    const forgedPayload = Buffer.from(
      JSON.stringify({ sub: 'un-autre-appareil', acc: CLAIMS.accountId }),
    ).toString('base64url');
    // En-tête et signature d'origine, contenu remplacé : la signature ne correspond plus.
    const forged = token.replace(/\.[^.]+\./, `.${forgedPayload}.`);

    expect(forged).not.toBe(token);
    expect(await tokensAt(NOW).verify(forged)).toBeUndefined();
  });

  it('refuse un jeton signé avec une autre clé', async () => {
    const { token } = await tokensAt(NOW, 'une-autre-clé-de-plus-de-32-caractères!').issue(CLAIMS);

    expect(await tokensAt(NOW).verify(token)).toBeUndefined();
  });

  it('refuse un jeton non signé (alg: none)', async () => {
    const unsigned = new UnsecuredJWT({ acc: CLAIMS.accountId })
      .setSubject(CLAIMS.deviceId)
      .setIssuer('stepbystep-api')
      .setAudience('stepbystep-api')
      .setExpirationTime(Math.floor(NOW / 1000) + 900)
      .encode();

    expect(await tokensAt(NOW).verify(unsigned)).toBeUndefined();
  });

  it('refuse un jeton correctement signé mais destiné à un autre service', async () => {
    const otherAudience = await new SignJWT({ acc: CLAIMS.accountId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(CLAIMS.deviceId)
      .setIssuer('stepbystep-api')
      .setAudience('un-autre-service')
      .setIssuedAt(Math.floor(NOW / 1000))
      .setExpirationTime(Math.floor(NOW / 1000) + 900)
      .sign(new TextEncoder().encode(SECRET));

    expect(await tokensAt(NOW).verify(otherAudience)).toBeUndefined();
  });

  it('refuse un jeton signé sans les informations attendues', async () => {
    const withoutAccount = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(CLAIMS.deviceId)
      .setIssuer('stepbystep-api')
      .setAudience('stepbystep-api')
      .setIssuedAt(Math.floor(NOW / 1000))
      .setExpirationTime(Math.floor(NOW / 1000) + 900)
      .sign(new TextEncoder().encode(SECRET));

    expect(await tokensAt(NOW).verify(withoutAccount)).toBeUndefined();
  });

  it('refuse n’importe quelle chaîne qui n’est pas un jeton', async () => {
    for (const garbage of ['', 'abc', 'a.b.c', 'Bearer xyz']) {
      expect(await tokensAt(NOW).verify(garbage)).toBeUndefined();
    }
  });

  it('refuse une clé de signature trop courte', () => {
    expect(() => tokensAt(NOW, 'courte')).toThrow(/32/);
  });
});
