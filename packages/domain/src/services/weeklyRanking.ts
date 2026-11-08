import type { IsoWeek } from '../model/IsoWeek';
import { StepCount } from '../model/StepCount';
import type { DailySteps } from './distributeStepsByDay';

/** Un membre d'un défi, avec les pas par jour de chacun de ses appareils. */
export interface MemberActivity {
  readonly memberId: string;
  readonly devices: readonly (readonly DailySteps[])[];
}

/** Place d'un membre au classement : rang partagé par les ex æquo (1, 1, 3). */
export interface RankingEntry {
  readonly memberId: string;
  readonly steps: StepCount;
  readonly rank: number;
}

/**
 * Pas d'un compte pour chaque jour : le plus grand total parmi ses appareils. Additionner
 * compterait deux fois les pas d'un utilisateur qui porte deux téléphones (ADR 0002,
 * décision 9). Jours triés par date.
 */
export const accountDailySteps = (devices: readonly (readonly DailySteps[])[]): DailySteps[] => {
  const best = new Map<string, DailySteps>();
  for (const daily of devices.flat()) {
    const known = best.get(daily.date.toString());
    // Stryker disable next-line EqualityOperator: équivalent, à totaux égaux le jour gardé est identique.
    if (known === undefined || daily.steps.value > known.steps.value) {
      best.set(daily.date.toString(), daily);
    }
  }
  return [...best.values()].sort((a, b) => a.date.compareTo(b.date));
};

/**
 * Classement d'un défi hebdomadaire : total de chaque membre sur les sept jours de la semaine
 * (maximum par jour entre ses appareils), du plus grand au plus petit. Les ex æquo partagent
 * leur rang et le suivant est sauté, comme RANK() en SQL ; entre eux, ordre par identifiant,
 * pour un résultat qui ne dépend pas de l'ordre d'arrivée.
 */
export const weeklyRanking = (
  week: IsoWeek,
  members: readonly MemberActivity[],
): RankingEntry[] => {
  const totals = members
    .map(({ memberId, devices }) => ({
      memberId,
      steps: accountDailySteps(devices)
        .filter(({ date }) => week.contains(date))
        .reduce((total, { steps }) => total.add(steps), StepCount.ZERO),
    }))
    .sort(
      (a, b) =>
        b.steps.value - a.steps.value ||
        // Stryker disable next-line EqualityOperator: équivalent, deux identifiants ne sont jamais égaux.
        (a.memberId < b.memberId ? -1 : 1),
    );
  return totals.map((entry) => ({
    ...entry,
    // Rang = 1 + nombre de membres strictement devant.
    rank: 1 + totals.filter(({ steps }) => steps.value > entry.steps.value).length,
  }));
};
