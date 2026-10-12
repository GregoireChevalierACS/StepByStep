import { Inject, Injectable } from '@nestjs/common';
import {
  type Clock,
  computeStreak,
  DailyActivity,
  err,
  GoalHistory,
  ok,
  type Result,
  TimeZoneHistory,
  unlockedBadges,
} from '@stepbystep/domain';
import { DataSource, LessThanOrEqual } from 'typeorm';
import { DailyGoalEntity } from '../database/entities/daily-goal.entity.js';
import { DailyStepsEntity } from '../database/entities/daily-steps.entity.js';
import { DeviceTimeZoneEntity } from '../database/entities/device-time-zone.entity.js';
import { DeviceEntity } from '../database/entities/device.entity.js';
import { dailyStepsToDomain } from '../database/mappers/daily-steps.mapper.js';
import { goalChangeToDomain } from '../database/mappers/goal-change.mapper.js';
import { periodToDomain } from '../database/mappers/time-zone-period.mapper.js';
import type { DeviceNotFound, MissingTimeZone } from '../devices/device-errors.js';
import type { UnknownTimeZone } from '../time/intl-local-calendar.js';
import { TimeZoneHistoryCalendar } from '../time/time-zone-history-calendar.js';
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
    private readonly dataSource: DataSource,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async compute(deviceId: string): Promise<Result<StreakReport, StreakError>> {
    const device = await this.dataSource.getRepository(DeviceEntity).findOneBy({ id: deviceId });
    if (!device) return err({ kind: 'DeviceNotFound', deviceId });

    // « Aujourd'hui » : la date locale de maintenant, dans le fuseau en vigueur de l'appareil.
    const periods = (
      await this.dataSource.getRepository(DeviceTimeZoneEntity).findBy({ deviceId })
    ).map((row) => this.valid(periodToDomain(row)));
    if (periods.length === 0) return err({ kind: 'MissingTimeZone', deviceId });
    const calendar = TimeZoneHistoryCalendar.for(this.valid(TimeZoneHistory.from(periods)));
    if (!calendar.ok) return calendar;
    const today = calendar.value.dateOf(this.clock.now());

    const goals = await this.goalHistory(device.accountId, today.toString());
    const rows = await this.dataSource.getRepository(DailyStepsEntity).find({
      where: { deviceId, day: LessThanOrEqual(today.toString()) },
      order: { day: 'ASC' },
    });
    const days = rows.map((row) => {
      const { date, steps } = this.valid(dailyStepsToDomain(row));
      return DailyActivity.start(date, goals.goalOn(date)).addSteps(steps);
    });

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
  private async goalHistory(accountId: string, today: string): Promise<GoalHistory> {
    const rows = await this.dataSource.getRepository(DailyGoalEntity).findBy({ accountId });
    const changes =
      rows.length > 0
        ? rows.map((row) => this.valid(goalChangeToDomain(row)))
        : [
            this.valid(
              goalChangeToDomain({
                accountId,
                effectiveFrom: today,
                goalSteps: DEFAULT_DAILY_GOAL,
              }),
            ),
          ];
    return this.valid(GoalHistory.from(changes));
  }

  /** Une donnée relue invalide est une incohérence : erreur serveur explicite. */
  private valid<T>(result: Result<T, unknown>): T {
    if (!result.ok) {
      throw new Error(`Donnée enregistrée invalide : ${JSON.stringify(result.error)}`);
    }
    return result.value;
  }
}
