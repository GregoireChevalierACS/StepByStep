import { z } from 'zod';

/** Semaine ISO, écrite AAAA-Wss. Forme seulement (400) : son existence relève du domaine (422). */
export const isoWeekSchema = z.string().regex(/^\d{4}-W\d{2}$/);

/** Paramètre `?week=2026-W45` : la semaine du défi, fournie par l'appareil (il connaît la date locale). */
export const rankingQuery = z.object({ week: isoWeekSchema });

export type RankingQueryParams = z.infer<typeof rankingQuery>;
