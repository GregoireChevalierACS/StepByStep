import { DailyGoal, err, type GoalChange, LocalDate, ok, type Result } from '@stepbystep/domain';
import { z } from 'zod';
import { localDateSchema, uuidSchema } from '../http/schemas.js';
import type { ValidationIssue } from '../http/zod-validation.pipe.js';

export const accountIdParam = uuidSchema;

/**
 * Corps de PUT /v1/accounts/:accountId/goal. Structure seulement (400) : la validité de
 * l'objectif (entier strictement positif) est une règle du domaine (422).
 * `effectiveFrom` est fourni par le client : c'est l'appareil qui connaît la date locale
 * de l'utilisateur, un compte pouvant avoir des appareils dans plusieurs fuseaux.
 */
export const setGoalBody = z.object({ goal: z.number(), effectiveFrom: localDateSchema });

export type SetGoalBody = z.infer<typeof setGoalBody>;

/** DTO → changement d'objectif du domaine, via les fabriques (qui revalident). */
export const toGoalChange = (body: SetGoalBody): Result<GoalChange, ValidationIssue[]> => {
  const goal = DailyGoal.create(body.goal);
  const effectiveFrom = LocalDate.create(body.effectiveFrom);
  const issues: ValidationIssue[] = [
    ...(goal.ok ? [] : [{ path: 'goal', message: goal.error.kind }]),
    ...(effectiveFrom.ok ? [] : [{ path: 'effectiveFrom', message: effectiveFrom.error.kind }]),
  ];
  if (!goal.ok || !effectiveFrom.ok) return err(issues);
  return ok({ goal: goal.value, effectiveFrom: effectiveFrom.value });
};
