import type { IsoWeek, Nickname } from '@stepbystep/domain';

/** Place d'un membre au classement de la semaine : rang partagé par les ex æquo (1, 1, 3). */
export interface RankedMember {
  readonly accountId: string;
  readonly nickname: Nickname;
  readonly steps: number;
  readonly rank: number;
}

/**
 * Port de lecture du classement hebdomadaire des groupes. Mêmes règles que weeklyRanking du
 * domaine, qui reste la référence : pas d'un compte par jour = maximum de ses appareils
 * (ADR 0002, décision 9), total sur les sept jours de la semaine ISO, rang partagé par les
 * ex æquo. Plusieurs groupes en une lecture : la clôture des défis classera tous les groupes.
 */
export interface RankingQuery {
  /**
   * Classement de chaque groupe demandé (tous ses membres, même à zéro pas), du premier au
   * dernier ; ex æquo dans l'ordre de leur identifiant. Un groupe inconnu est absent du résultat.
   */
  weeklyRankings(groupIds: readonly string[], week: IsoWeek): Promise<Map<string, RankedMember[]>>;
}

export const RANKING_QUERY = Symbol('RANKING_QUERY');
