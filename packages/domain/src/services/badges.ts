import type { Specification } from '../shared/Specification';
import { type ActivityHistory, bestDayOfAtLeast, streakOfAtLeast } from './badgeRules';

export interface Badge {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly rule: Specification<ActivityHistory>;
}

/**
 * Catalogue des badges : chaque badge est une composition déclarative de règles
 * de base. Ajouter un badge = ajouter une entrée, sans toucher aux règles existantes.
 */
export const BADGES: readonly Badge[] = [
  {
    id: 'perfect-week',
    label: 'Semaine parfaite',
    description: '7 jours de suite avec l’objectif atteint.',
    rule: streakOfAtLeast(7),
  },
  {
    id: 'marathoner',
    label: 'Marathonien',
    description: '7 jours de suite avec l’objectif atteint, et une journée à 20 000 pas ou plus.',
    rule: streakOfAtLeast(7).and(bestDayOfAtLeast(20_000)),
  },
  {
    id: 'outstanding',
    label: 'Exceptionnel',
    description: '30 jours de suite avec l’objectif atteint, ou une journée à 30 000 pas ou plus.',
    rule: streakOfAtLeast(30).or(bestDayOfAtLeast(30_000)),
  },
];

/** Badges du catalogue dont la règle est satisfaite par l'historique, dans l'ordre du catalogue. */
export const unlockedBadges = (
  history: ActivityHistory,
  catalog: readonly Badge[] = BADGES,
): Badge[] => catalog.filter((badge) => badge.rule.isSatisfiedBy(history));
