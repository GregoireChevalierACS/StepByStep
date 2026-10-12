import { LocalDate } from '@stepbystep/domain';
import { z } from 'zod';

/** Jour local AAAA-MM-JJ, validé par le domaine (rejette aussi les dates impossibles). */
export const localDateSchema = z
  .string()
  .refine((value) => LocalDate.create(value).ok, { message: 'Date AAAA-MM-JJ attendue' })
  // La règle refine ne se traduit pas en JSON Schema : on documente le format explicitement.
  .meta({ format: 'date', example: '2026-10-12' });

/** Identifiant (appareil, compte) : un UUID, sinon 400 avant tout accès à la base. */
export const uuidSchema = z.uuid();
