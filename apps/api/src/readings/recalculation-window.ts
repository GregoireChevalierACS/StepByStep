import type { LocalCalendar, LocalDate } from '@stepbystep/domain';

export interface RecalculationInput {
  /** Instants modifiés : relevés nouvellement acceptés, débuts de nouvelles périodes de fuseau. */
  readonly changedInstants: readonly number[];
  /** Dernier relevé déjà enregistré avant le plus ancien instant modifié. */
  readonly previousNeighbor?: number;
  /** Premier relevé déjà enregistré après le plus récent instant modifié. */
  readonly nextNeighbor?: number;
}

export interface RecalculationWindow {
  /** Jours locaux dont le total doit être recalculé (bornes incluses). */
  readonly firstDay: LocalDate;
  readonly lastDay: LocalDate;
  /** Intervalle [from, to[ couvrant ces journées entières, de minuit à minuit (heure locale). */
  readonly from: number;
  readonly to: number;
}

/**
 * Jours à recalculer après l'ajout de relevés. Un relevé inséré change les paires qu'il
 * forme avec ses voisins : les jours touchés vont du voisin précédent au voisin suivant.
 * La fenêtre couvre des journées entières : un jour recalculé à partir d'une partie
 * seulement de ses relevés aurait un total faux.
 */
export const recalculationWindow = (
  { changedInstants, previousNeighbor, nextNeighbor }: RecalculationInput,
  calendar: LocalCalendar,
): RecalculationWindow => {
  if (changedInstants.length === 0) {
    throw new Error('Aucun instant modifié : rien à recalculer.');
  }
  const start = previousNeighbor ?? Math.min(...changedInstants);
  const end = nextNeighbor ?? Math.max(...changedInstants);
  const firstDay = calendar.dateOf(start);
  const lastDay = calendar.dateOf(end);
  return {
    firstDay,
    lastDay,
    from: calendar.startOfDay(firstDay),
    to: calendar.startOfDay(lastDay.next()),
  };
};
