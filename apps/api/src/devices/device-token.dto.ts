import { z } from 'zod';

/** Corps de l'échange secret → jeton. La longueur est bornée : scrypt n'a pas à hacher 1 Mo. */
export const deviceTokenBody = z.object({ secret: z.string().min(1).max(256) });

export type DeviceTokenBody = z.infer<typeof deviceTokenBody>;
