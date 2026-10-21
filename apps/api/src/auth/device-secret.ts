import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const SECRET_BYTES = 32;
const SALT_BYTES = 16;
const KEY_BYTES = 32;

export interface DeviceSecret {
  /** Remis une seule fois à l'appareil, jamais stocké par le serveur. */
  readonly secret: string;
  /** Ce que stocke le serveur : `scrypt$<sel>$<empreinte>`, en base64url. */
  readonly hash: string;
}

const hashWith = (secret: string, salt: Buffer): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(secret, salt, KEY_BYTES, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });

/**
 * Secret d'appareil : 32 octets aléatoires (256 bits), échangés plus tard contre des jetons
 * courts. Le serveur n'en garde qu'une empreinte scrypt salée : une fuite de la base ne permet
 * pas de se faire passer pour un appareil, et scrypt rend l'essai massif coûteux.
 */
export const generateDeviceSecret = async (): Promise<DeviceSecret> => {
  const secret = randomBytes(SECRET_BYTES).toString('base64url');
  const salt = randomBytes(SALT_BYTES);
  const hash = await hashWith(secret, salt);
  return { secret, hash: `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}` };
};

/**
 * Le secret correspond-il à l'empreinte ? Comparaison à temps constant : le temps de réponse
 * ne révèle pas combien d'octets étaient justes. Une empreinte mal formée vaut un refus.
 */
export const verifyDeviceSecret = async (secret: string, stored: string): Promise<boolean> => {
  const [scheme, salt, expected] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !expected) return false;
  const expectedBytes = Buffer.from(expected, 'base64url');
  if (expectedBytes.length !== KEY_BYTES) return false;
  const actual = await hashWith(secret, Buffer.from(salt, 'base64url'));
  return timingSafeEqual(actual, expectedBytes);
};
