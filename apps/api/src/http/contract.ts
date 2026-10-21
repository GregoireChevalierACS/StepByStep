import { z } from 'zod';
import { localDateSchema, uuidSchema } from './schemas.js';

/**
 * Schémas des RÉPONSES de l'API, source unique du contrat publié en OpenAPI. Objets stricts :
 * un champ ajouté sans mise à jour du contrat fait échouer le test de contrat.
 */

export const registeredDeviceResponse = z.strictObject({
  accountId: uuidSchema,
  deviceId: uuidSchema,
  // Renvoyé une seule fois : l'appareil le conserve pour obtenir ses jetons.
  secret: z.string(),
});

export const deviceTokenResponse = z.strictObject({
  token: z.string(),
  tokenType: z.literal('Bearer'),
  expiresIn: z.number().int().positive(),
});

export const dayTotalResponse = z.strictObject({
  day: localDateSchema,
  steps: z.number().int().nonnegative(),
});

export const recordReadingsResponse = z.strictObject({
  accepted: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  days: z.array(dayTotalResponse),
});

export const dailyStepsResponse = z.array(dayTotalResponse);

export const goalHistoryResponse = z.array(
  z.strictObject({ effectiveFrom: localDateSchema, goal: z.number().int().positive() }),
);

export const streakResponse = z.strictObject({
  today: localDateSchema,
  streak: z.number().int().nonnegative(),
  badges: z.array(z.strictObject({ id: z.string(), label: z.string(), description: z.string() })),
});

/** Corps d'erreur, RFC 9457 (Problem Details), servi en application/problem+json. */
export const problemDetailsResponse = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  instance: z.string(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
