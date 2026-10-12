import { LocalDate } from '@stepbystep/domain';
import { z } from 'zod';

/** Jour local AAAA-MM-JJ, validé par le domaine (rejette aussi les dates impossibles). */
export const localDateSchema = z
  .string()
  .refine((value) => LocalDate.create(value).ok, { message: 'Date AAAA-MM-JJ attendue' });

/** Identifiant (appareil, compte) : un UUID, sinon 400 avant tout accès à la base. */
export const uuidSchema = z.uuid();
