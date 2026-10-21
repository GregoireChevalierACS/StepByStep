import type { Clock } from '@stepbystep/domain';

/** Jeton d'injection du port Clock (une interface n'existe pas à l'exécution). */
export const CLOCK = Symbol('CLOCK');

/** Horloge réelle, utilisée en production ; les tests injectent une horloge fixe. */
export const systemClock: Clock = { now: () => Date.now() };
