import { describe, expect, it } from 'vitest';
import { generateDeviceSecret, verifyDeviceSecret } from './device-secret.js';

describe('secret d’appareil', () => {
  it('génère un secret aléatoire, différent à chaque fois', async () => {
    const first = await generateDeviceSecret();
    const second = await generateDeviceSecret();

    expect(first.secret).not.toBe(second.secret);
    // 32 octets en base64url : 43 caractères, sans caractère à échapper dans un JSON ou une URL.
    expect(first.secret).toMatch(/^[\w-]{43}$/);
  });

  it('ne stocke qu’une empreinte salée, jamais le secret', async () => {
    const { secret, hash } = await generateDeviceSecret();

    expect(hash).not.toContain(secret);
    expect(hash).toMatch(/^scrypt\$[\w-]+\$[\w-]+$/);
    // Sel aléatoire : deux empreintes d'un même secret diffèrent.
    expect((await generateDeviceSecret()).hash).not.toBe(hash);
  });

  it('reconnaît le bon secret et refuse les autres', async () => {
    const { secret, hash } = await generateDeviceSecret();

    expect(await verifyDeviceSecret(secret, hash)).toBe(true);
    expect(await verifyDeviceSecret(`${secret}x`, hash)).toBe(false);
    expect(await verifyDeviceSecret((await generateDeviceSecret()).secret, hash)).toBe(false);
  });

  it('refuse une empreinte mal formée au lieu de lever une exception', async () => {
    const { secret } = await generateDeviceSecret();

    for (const malformed of ['', 'bcrypt$a$b', 'scrypt$', 'scrypt$sel', 'scrypt$sel$']) {
      expect(await verifyDeviceSecret(secret, malformed)).toBe(false);
    }
  });
});
