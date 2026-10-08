import type { DailyGoal } from './DailyGoal';
import type { LocalDate } from './LocalDate';
import { StepCount } from './StepCount';

/** Activité d'une journée locale : les pas cumulés et l'objectif du jour. Immuable. */
export class DailyActivity {
  private constructor(
    readonly date: LocalDate,
    readonly goal: DailyGoal,
    readonly steps: StepCount,
  ) {}

  static start(date: LocalDate, goal: DailyGoal): DailyActivity {
    return new DailyActivity(date, goal, StepCount.ZERO);
  }

  addSteps(steps: StepCount): DailyActivity {
    return new DailyActivity(this.date, this.goal, this.steps.add(steps));
  }

  isGoalReached(): boolean {
    return this.steps.value >= this.goal.steps.value;
  }
}
