import { randomUUID } from 'node:crypto';
import { computeStreak, DailyActivity, DailyGoal, LocalDate, StepCount } from '@stepbystep/domain';
import fc from 'fast-check';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { goalHistoryOrDefault } from '../../goals/default-daily-goal.js';
import { unwrap } from '../../testing/unwrap.js';
import { dataSourceOptions } from '../data-source-options.js';
import { AccountEntity } from '../entities/account.entity.js';
import { DailyGoalEntity } from '../entities/daily-goal.entity.js';
import { DailyStepsEntity } from '../entities/daily-steps.entity.js';
import { DeviceEntity } from '../entities/device.entity.js';
import { currentStreaks } from './current-streaks.query.js';

/** Jour à `offset` jours du 15 octobre 2026 (négatif : avant). */
const dayAt = (offset: number): string =>
  new Date(Date.UTC(2026, 9, 15 + offset)).toISOString().slice(0, 10);
const date = (iso: string) => unwrap(LocalDate.create(iso));

/** Données d'un appareil : pas par jour et objectifs de son compte, en décalages de jours. */
interface DeviceHistory {
  readonly todayOffset: number;
  readonly days: readonly { readonly offset: number; readonly steps: number }[];
  readonly goals: readonly { readonly offset: number; readonly goal: number }[];
}

describe('currentStreaks (SQL, gaps and islands)', () => {
  let dataSource: DataSource;

  // Un compte et un appareil neufs par historique : la base est partagée entre les tests.
  const givenDevice = async ({ days, goals }: DeviceHistory): Promise<string> => {
    const account = await dataSource.getRepository(AccountEntity).save({});
    const device = await dataSource.getRepository(DeviceEntity).save({ accountId: account.id });
    await dataSource.getRepository(DailyGoalEntity).insert(
      goals.map(({ offset, goal }) => ({
        accountId: account.id,
        effectiveFrom: dayAt(offset),
        goalSteps: goal,
      })),
    );
    await dataSource
      .getRepository(DailyStepsEntity)
      .insert(
        days.map(({ offset, steps }) => ({ deviceId: device.id, day: dayAt(offset), steps })),
      );
    return device.id;
  };

  // La référence : le domaine, appliqué comme le fait StreakService (jours jusqu'à aujourd'hui,
  // chacun jugé avec l'objectif en vigueur ce jour-là).
  const domainStreak = ({ todayOffset, days, goals }: DeviceHistory): number => {
    const today = date(dayAt(todayOffset));
    const history = goalHistoryOrDefault(
      goals.map(({ offset, goal }) => ({
        effectiveFrom: date(dayAt(offset)),
        goal: unwrap(DailyGoal.create(goal)),
      })),
      today,
    );
    const activities = days
      .filter(({ offset }) => offset <= todayOffset)
      .map(({ offset, steps }) => {
        const day = date(dayAt(offset));
        return DailyActivity.start(day, history.goalOn(day)).addSteps(
          unwrap(StepCount.create(steps)),
        );
      });
    return computeStreak(activities, today);
  };

  const sqlStreaks = async (histories: readonly DeviceHistory[]): Promise<number[]> => {
    const deviceIds = await Promise.all(histories.map(givenDevice));
    const streaks = await currentStreaks(
      dataSource,
      histories.map(({ todayOffset }, index) => ({
        deviceId: deviceIds[index] ?? '',
        today: date(dayAt(todayOffset)),
      })),
    );
    return deviceIds.map((deviceId) => streaks.get(deviceId) ?? -1);
  };

  beforeAll(async () => {
    dataSource = await new DataSource(dataSourceOptions(inject('databaseUrl'))).initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  describe('exemples', () => {
    const reached = (...offsets: number[]) => offsets.map((offset) => ({ offset, steps: 10_000 }));

    it('compte les jours consécutifs jusqu’à aujourd’hui inclus', async () => {
      expect(await sqlStreaks([{ todayOffset: 0, days: reached(-2, -1, 0), goals: [] }])).toEqual([
        3,
      ]);
    });

    it('ne casse pas la série tant que l’objectif du jour n’est pas atteint', async () => {
      const days = [...reached(-2, -1), { offset: 0, steps: 4000 }];

      expect(await sqlStreaks([{ todayOffset: 0, days, goals: [] }])).toEqual([2]);
    });

    it('s’arrête au premier jour manquant ou raté', async () => {
      const missing = [...reached(-7, -6), ...reached(-4, -3)];
      const failed = [...reached(-7, -6), { offset: -5, steps: 9_999 }, ...reached(-4, -3)];

      expect(await sqlStreaks([{ todayOffset: -3, days: missing, goals: [] }])).toEqual([2]);
      expect(await sqlStreaks([{ todayOffset: -3, days: failed, goals: [] }])).toEqual([2]);
    });

    it('juge chaque jour avec l’objectif en vigueur ce jour-là', async () => {
      const days = [
        { offset: -2, steps: 8_000 },
        { offset: -1, steps: 8_000 },
        { offset: 0, steps: 8_000 },
      ];
      // 8 000 pas suffisent avant le 14 (objectif 8 000), plus à partir du 14 (12 000).
      const goals = [
        { offset: -5, goal: 8_000 },
        { offset: -1, goal: 12_000 },
      ];

      expect(await sqlStreaks([{ todayOffset: -2, days, goals }])).toEqual([1]);
      expect(await sqlStreaks([{ todayOffset: 0, days, goals }])).toEqual([0]);
    });

    it('applique un objectif dès sa date d’effet', async () => {
      const days = [
        { offset: -1, steps: 8_000 },
        { offset: 0, steps: 8_000 },
      ];
      const goals = [
        { offset: -10, goal: 5_000 },
        { offset: -1, goal: 8_000 },
      ];

      expect(await sqlStreaks([{ todayOffset: 0, days, goals }])).toEqual([2]);
    });

    it('applique le premier objectif du compte aux jours qui précèdent sa date d’effet', async () => {
      const days = [-2, -1, 0].map((offset) => ({ offset, steps: 5_000 }));

      expect(
        await sqlStreaks([{ todayOffset: 0, days, goals: [{ offset: 0, goal: 5_000 }] }]),
      ).toEqual([3]);
    });

    it('ignore les jours après « aujourd’hui » et renvoie 0 pour un appareil inconnu', async () => {
      const histories = [{ todayOffset: -1, days: reached(-1, 0, 1), goals: [] }];
      const [streak] = await sqlStreaks(histories);
      const unknown = await currentStreaks(dataSource, [
        { deviceId: randomUUID(), today: date(dayAt(0)) },
      ]);

      expect(streak).toBe(1);
      expect([...unknown.values()]).toEqual([0]);
    });

    it('calcule la série de plusieurs appareils en une requête, chacun avec son aujourd’hui', async () => {
      expect(
        await sqlStreaks([
          { todayOffset: 0, days: reached(-1, 0), goals: [] },
          { todayOffset: -1, days: reached(-3, -2, -1), goals: [] },
          { todayOffset: 0, days: [], goals: [] },
        ]),
      ).toEqual([2, 3, 0]);
    });
  });

  // Valeurs proches des objectifs pour multiplier les jours tout juste atteints ou ratés, et
  // historiques denses (un jour manque rarement) : les séries sont longues, et les dates d'effet
  // des objectifs tombent souvent dedans, là où une erreur de borne changerait le résultat.
  const GOALS = [5_000, 8_000, 10_000];
  const STEPS = [4_999, 5_000, 7_999, 8_000, 9_999, 10_000, 15_000];
  const deviceHistory: fc.Arbitrary<DeviceHistory> = fc.record({
    todayOffset: fc.integer({ min: -3, max: 3 }),
    days: fc.uniqueArray(
      fc.record({ offset: fc.integer({ min: -20, max: 3 }), steps: fc.constantFrom(...STEPS) }),
      { selector: ({ offset }) => offset, minLength: 16, maxLength: 24 },
    ),
    goals: fc.uniqueArray(
      fc.record({ offset: fc.integer({ min: -20, max: 3 }), goal: fc.constantFrom(...GOALS) }),
      { selector: ({ offset }) => offset, maxLength: 4 },
    ),
  });

  it('donne toujours la même série que computeStreak du domaine (propriété)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(deviceHistory, { minLength: 1, maxLength: 3 }),
        async (histories) => {
          expect(await sqlStreaks(histories)).toEqual(histories.map(domainStreak));
        },
      ),
      { numRuns: 100 },
    );
  });
});
