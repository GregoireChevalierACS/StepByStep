import type { IsoWeek } from '@stepbystep/domain';
import type { RankedMember } from './ranking.query.js';

/** Classement des groupes demandés, fourni par la clôture (RankingQuery en production). */
export type RankGroups = (groupIds: readonly string[]) => Promise<Map<string, RankedMember[]>>;

/**
 * Port des classements figés (défis terminés). Une semaine close ne bouge plus : les pas
 * arrivés ensuite ne changent pas son classement. Supprimer un compte le retire des classements
 * figés ; supprimer un groupe supprime les siens.
 */
export interface WeeklyResultsRepository {
  /**
   * Fige la semaine pour chaque groupe qui ne l'est pas encore, avec le classement que donne
   * `rank`. Une seule clôture à la fois, même entre plusieurs instances de l'API : si une autre
   * est en cours, rien n'est fait et le résultat est `undefined`. Sinon, renvoie le nombre de
   * groupes figés (0 si tous l'étaient déjà). Tout ou rien.
   */
  closeWeek(week: IsoWeek, rank: RankGroups): Promise<number | undefined>;

  /** Classement figé du groupe pour cette semaine ; `undefined` si elle n'est pas close. */
  resultsOf(groupId: string, week: IsoWeek): Promise<RankedMember[] | undefined>;
}

export const WEEKLY_RESULTS_REPOSITORY = Symbol('WEEKLY_RESULTS_REPOSITORY');
