import { Inject, Injectable } from '@nestjs/common';
import {
  type Clock,
  computeStreak,
  DailyActivity,
  DailyGoal,
  err,
  type GoalChange,
  GoalHistory,
  type LocalDate,
  ok,
  type Result,
  TimeZoneHistory,
  unlockedBadges,
} from '@stepbystep/domain';
import {
  DAILY_STEPS_REPOSITORY,
  type DailyStepsRepository,
} from '../daily-steps/daily-steps.repository.js';
import type { DeviceNotFound, MissingTimeZone } from '../devices/device-errors.js';
import { DEVICE_REPOSITORY, type DeviceRepository } from '../devices/device.repository.js';
import { GOAL_REPOSITORY, type GoalRepository } from '../goals/goal.repository.js';
import type { UnknownTimeZone } from '../time/intl-local-calendar.js';
import { TimeZoneHistoryCalendar } from '../time/time-zone-history-calendar.js';
import { TIME_ZONE_REPOSITORY, type TimeZoneRepository } from '../time/time-zone.repository.js';
import { CLOCK } from './clock.js';

/** Objectif appliqué tant que le compte n'en a fixé aucun (la référence courante). */
export const DEFAULT_DAILY_GOAL = 10_000;

export interface StreakReport {
  readonly today: string;
  readonly streak: number;
  readonly badges: readonly {
    readonly id: string;
    readonly label: string;
    readonly description: string;
  }[];
}

export type StreakError = DeviceNotFound | MissingTimeZone | UnknownTimeZone;

/**
 * Série de jours avec l'objectif atteint, et badges débloqués, pour un appareil. Réunit le
 * domaine : calendrier de l'appareil (« aujourd'hui » dans son fuseau), historique des
 * objectifs (chaque jour jugé avec l'objectif en vigueur ce jour-là), computeStreak et
 * unlockedBadges. Par appareil : la règle d'agrégation multi-appareils n'est pas encore
 * décidée (ADR 0002).
 */
@Injectable()
export class StreakService {
  constructor(
    @Inject(DEVICE_REPOSITORY) private readonly devices: DeviceRepository,
    @Inject(TIME_ZONE_REPOSITORY) private readonly timeZones: TimeZoneRepository,
    @Inject(DAILY_STEPS_REPOSITORY) private readonly dailySteps: DailyStepsRepository,
    @Inject(GOAL_REPOSITORY) private readonly goals: GoalRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async compute(deviceId: string): Promise<Result<StreakReport, StreakError>> {
    const accountId = await this.devices.accountOf(deviceId);
    if (accountId === undefined) return err({ kind: 'DeviceNotFound', deviceId });

    // « Aujourd'hui » : la date locale de maintenant, dans le fuseau en vigueur de l'appareil.
    const periods = await this.timeZones.periodsOf(deviceId);
    if (periods.length === 0) return err({ kind: 'MissingTimeZone', deviceId });
    const calendar = TimeZoneHistoryCalendar.for(this.consistent(TimeZoneHistory.from(periods)));
    if (!calendar.ok) return calendar;
    const today = calendar.value.dateOf(this.clock.now());

    const goals = await this.goalHistory(accountId, today);
    const days = (await this.dailySteps.upTo(deviceId, today)).map(({ date, steps }) =>
      DailyActivity.start(date, goals.goalOn(date)).addSteps(steps),
    );

    return ok({
      today: today.toString(),
      streak: computeStreak(days, today),
      badges: unlockedBadges({ days, today }).map(({ id, label, description }) => ({
        id,
        label,
        description,
      })),
    });
  }

  /** Historique des objectifs du compte, ou l'objectif par défaut s'il n'en a fixé aucun. */
  private async goalHistory(accountId: string, today: LocalDate): Promise<GoalHistory> {
    const changes = await this.goals.changesOf(accountId);
    const defaultChange: GoalChange = {
      effectiveFrom: today,
      goal: this.consistent(DailyGoal.create(DEFAULT_DAILY_GOAL)),
    };
    return this.consistent(GoalHistory.from(changes.length > 0 ? changes : [defaultChange]));
  }

  /** Données enregistrées incohérentes (impossible si la persistance respecte son contrat). */
  private consistent<T>(result: Result<T, unknown>): T {
    if (!result.ok) {
      throw new Error(`Donnée enregistrée incohérente : ${JSON.stringify(result.error)}`);
    }
    return result.value;
  }
}
