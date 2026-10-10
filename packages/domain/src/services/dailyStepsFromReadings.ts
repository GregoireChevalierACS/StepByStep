import type { StepCounterReading } from '../model/StepCounterReading';
import type { LocalCalendar } from '../ports/LocalCalendar';
import { type DailySteps, distributeOrderedStepsByDay } from './distributeStepsByDay';

// Même identité qu'un relevé côté serveur : contrainte unique (boot_count, taken_at).
const identityOf = (reading: StepCounterReading) =>
  `${String(reading.bootCount)}:${String(reading.takenAt)}`;

/**
 * Transforme une série de relevés, reçue dans n'importe quel ordre et avec
 * d'éventuels doublons, en pas par jour local (ordre chronologique, un jour une fois).
 *
 * 1. Dédoublonne : un relevé reçu deux fois ne compte qu'une fois. Si deux relevés
 *    de même identité se contredisent, on garde la plus grande valeur du compteur,
 *    pour un résultat déterministe.
 * 2. Trie par instant (puis par démarrage, pour départager deux relevés simultanés).
 * 3. Répartit les pas de chaque paire consécutive sur les jours, puis cumule par jour.
 */
export const dailyStepsFromReadings = (
  readings: readonly StepCounterReading[],
  calendar: LocalCalendar,
): DailySteps[] => {
  const uniqueReadings = new Map<string, StepCounterReading>();
  for (const reading of readings) {
    const known = uniqueReadings.get(identityOf(reading));
    // Stryker disable next-line EqualityOperator: équivalent, à valeur égale les deux relevés sont identiques (même identité, même compteur).
    if (!known || reading.stepsSinceBoot.value > known.stepsSinceBoot.value) {
      uniqueReadings.set(identityOf(reading), reading);
    }
  }

  const ordered = [...uniqueReadings.values()].sort(
    (a, b) => a.takenAt - b.takenAt || a.bootCount - b.bootCount,
  );
  if (ordered.length < 2) return [];

  // Les paires étant traitées dans l'ordre chronologique, l'ordre d'insertion
  // de la Map est aussi l'ordre chronologique des jours.
  const totals = new Map<string, DailySteps>();
  ordered.reduce((previous, current) => {
    for (const { date, steps } of distributeOrderedStepsByDay(previous, current, calendar)) {
      const known = totals.get(date.toString());
      totals.set(date.toString(), { date, steps: known ? known.steps.add(steps) : steps });
    }
    return current;
  });
  return [...totals.values()];
};
