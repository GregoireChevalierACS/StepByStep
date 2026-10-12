import { z } from 'zod';
import { localDateSchema } from '../http/schemas.js';

// Période maximale par requête : évite qu'une seule requête relise des années d'historique.
export const MAX_PERIOD_DAYS = 366;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Paramètres `?from=AAAA-MM-JJ&to=AAAA-MM-JJ`, bornes incluses. */
export const periodQuery = z
  .object({ from: localDateSchema, to: localDateSchema })
  .refine(({ from, to }) => from <= to, {
    message: 'Le début de la période doit précéder sa fin',
    path: ['to'],
  })
  .refine(({ from, to }) => (Date.parse(to) - Date.parse(from)) / MS_PER_DAY < MAX_PERIOD_DAYS, {
    message: `Période limitée à ${String(MAX_PERIOD_DAYS)} jours`,
    path: ['to'],
  });

export type PeriodQuery = z.infer<typeof periodQuery>;
