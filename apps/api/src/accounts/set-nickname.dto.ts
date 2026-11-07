import { z } from 'zod';

/**
 * Corps de PUT /v1/accounts/:accountId/nickname. Structure seulement (400) : la longueur et
 * les caractères permis sont des règles du domaine (Nickname, 422).
 */
export const setNicknameBody = z.object({ nickname: z.string() });

export type SetNicknameBody = z.infer<typeof setNicknameBody>;
