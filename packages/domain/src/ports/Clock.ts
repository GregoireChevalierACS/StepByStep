/**
 * Source de « maintenant ». L'heure courante est une dépendance comme une autre : horloge
 * système en production, horloge fixe dans les tests (minuit, fuseaux, séries de jours
 * deviennent testables de façon déterministe).
 */
export interface Clock {
  /** Instant courant, en millisecondes epoch. */
  now(): number;
}
