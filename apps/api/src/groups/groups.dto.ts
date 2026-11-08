import { z } from 'zod';
import { uuidSchema } from '../http/schemas.js';

/** Corps de POST /v1/accounts/:accountId/groups. Structure (400) ; règles du nom : domaine (422). */
export const createGroupBody = z.object({ name: z.string() });
export type CreateGroupBody = z.infer<typeof createGroupBody>;

/** Code d'invitation : 128 bits aléatoires en base64url, soit 22 caractères. */
export const inviteCodeSchema = z.string().regex(/^[A-Za-z0-9_-]{22}$/);

export const joinGroupBody = z.object({ inviteCode: inviteCodeSchema });
export type JoinGroupBody = z.infer<typeof joinGroupBody>;

export const groupIdParam = uuidSchema;
