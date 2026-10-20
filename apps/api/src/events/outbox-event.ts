import type { GoalReached } from '@stepbystep/domain';

/**
 * Événement à publier, tel qu'il est écrit dans l'outbox. La clé est son identité métier :
 * un même événement produit deux fois (renvoi d'un lot, recalcul) n'est enregistré qu'une
 * fois, et les consommateurs peuvent s'en servir pour ignorer une livraison en double.
 */
export interface OutboxEvent {
  readonly key: string;
  readonly type: string;
  readonly payload: Readonly<Record<string, string | number>>;
}

/** GoalReached du domaine → événement publiable : un seul par appareil et par jour. */
export const goalReachedEvent = (
  deviceId: string,
  { date, steps, goal }: GoalReached,
): OutboxEvent => ({
  key: `goal-reached:${deviceId}:${date.toString()}`,
  type: 'GoalReached',
  payload: { deviceId, day: date.toString(), steps: steps.value, goal: goal.steps.value },
});
