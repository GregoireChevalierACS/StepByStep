import type { Clock } from '@stepbystep/domain';
import { jwtVerify, SignJWT } from 'jose';

/** Ce qu'atteste un jeton : l'appareil authentifié et son compte. */
export interface DeviceClaims {
  readonly deviceId: string;
  readonly accountId: string;
}

export interface IssuedToken {
  readonly token: string;
  /** Durée de validité, en secondes (convention OAuth `expires_in`). */
  readonly expiresIn: number;
}

// Émetteur et destinataire du jeton : un jeton émis pour un autre service est refusé.
const ISSUER = 'stepbystep-api';
const AUDIENCE = 'stepbystep-api';
const LIFETIME_SECONDS = 15 * 60;
const MIN_SECRET_LENGTH = 32;

/**
 * Jetons d'appareil : JWT signés HMAC-SHA256, courts (15 min). Ils circulent à chaque requête ;
 * s'ils fuient (journaux, proxy), ils ne servent que quelques minutes. Le secret d'appareil,
 * lui, ne circule qu'au moment de l'échange contre un jeton.
 */
export class DeviceTokens {
  private readonly key: Uint8Array;

  constructor(
    secret: string,
    private readonly clock: Clock,
  ) {
    if (secret.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `Clé de signature des jetons trop courte (${String(MIN_SECRET_LENGTH)} au moins).`,
      );
    }
    this.key = new TextEncoder().encode(secret);
  }

  async issue({ deviceId, accountId }: DeviceClaims): Promise<IssuedToken> {
    const now = Math.floor(this.clock.now() / 1000);
    const token = await new SignJWT({ acc: accountId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(deviceId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(now + LIFETIME_SECONDS)
      .sign(this.key);
    return { token, expiresIn: LIFETIME_SECONDS };
  }

  /**
   * Appareil et compte attestés par le jeton, ou `undefined` s'il est invalide : signature
   * fausse, algorithme inattendu (dont `none`), émetteur ou destinataire inconnu, expiré, ou
   * informations manquantes. Le motif exact n'est pas renvoyé : il ne regarde pas le client.
   */
  async verify(token: string): Promise<DeviceClaims | undefined> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ['HS256'],
        issuer: ISSUER,
        audience: AUDIENCE,
        currentDate: new Date(this.clock.now()),
      });
      const { sub, acc } = payload;
      if (typeof sub !== 'string' || typeof acc !== 'string') return undefined;
      return { deviceId: sub, accountId: acc };
    } catch {
      return undefined;
    }
  }
}
