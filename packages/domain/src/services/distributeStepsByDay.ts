import type { LocalDate } from '../model/LocalDate';
import type { StepCount } from '../model/StepCount';
import type { StepCounterReading } from '../model/StepCounterReading';
import type { LocalCalendar } from '../ports/LocalCalendar';
import { err, ok, type Result } from '../shared/Result';

export interface DailySteps {
  readonly date: LocalDate;
  readonly steps: StepCount;
}

export interface ReadingsOutOfOrder {
  readonly kind: 'ReadingsOutOfOrder';
  readonly previousTakenAt: number;
  readonly currentTakenAt: number;
}

/**
 * Répartit les pas faits entre deux relevés sur les jours locaux traversés, au
 * prorata du temps passé dans chaque jour. Un relevé pris pile à minuit clôt la
 * journée précédente. Après un redémarrage, les pas depuis le démarrage sont
 * répartis sur tout l'intervalle : c'est une approximation assumée.
 */
export const distributeStepsByDay = (
  previous: StepCounterReading,
  current: StepCounterReading,
  calendar: LocalCalendar,
): Result<readonly DailySteps[], ReadingsOutOfOrder> => {
  if (current.takenAt < previous.takenAt) {
    return err({
      kind: 'ReadingsOutOfOrder',
      previousTakenAt: previous.takenAt,
      currentTakenAt: current.takenAt,
    });
  }
  return ok(distributeOrderedStepsByDay(previous, current, calendar));
};

/**
 * Cœur de la répartition, pour deux relevés dont l'ordre est déjà garanti par
 * l'appelant (`previous.takenAt <= current.takenAt`). Interne au domaine.
 */
export const distributeOrderedStepsByDay = (
  previous: StepCounterReading,
  current: StepCounterReading,
  calendar: LocalCalendar,
): DailySteps[] => {
  // Temps passé dans chacun des jours locaux consécutifs traversés.
  const firstDate = calendar.dateOf(previous.takenAt);
  const durations: number[] = [];
  let date = firstDate;
  let dayStart = previous.takenAt;
  let nextMidnight = calendar.startOfDay(date.next());
  while (nextMidnight < current.takenAt) {
    durations.push(nextMidnight - dayStart);
    date = date.next();
    dayStart = nextMidnight;
    nextMidnight = calendar.startOfDay(date.next());
  }
  durations.push(current.takenAt - dayStart);

  let day = firstDate;
  return current
    .stepsSince(previous)
    .split(durations)
    .map((steps) => {
      const dailySteps = { date: day, steps };
      day = day.next();
      return dailySteps;
    });
};
