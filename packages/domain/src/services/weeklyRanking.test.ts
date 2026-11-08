import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { IsoWeek } from '../model/IsoWeek';
import { LocalDate } from '../model/LocalDate';
import { StepCount } from '../model/StepCount';
import { unwrap } from '../testing/unwrap';
import type { DailySteps } from './distributeStepsByDay';
import { accountDailySteps, weeklyRanking } from './weeklyRanking';

const day = (date: string, steps: number): DailySteps => ({
  date: unwrap(LocalDate.create(date)),
  steps: unwrap(StepCount.create(steps)),
});
const plain = (days: readonly DailySteps[]) =>
  days.map(({ date, steps }) => [date.toString(), steps.value]);
// Semaine du lundi 2 au dimanche 8 novembre 2026.
const week = () => unwrap(IsoWeek.create('2026-W45'));
const ranked = (entries: ReturnType<typeof weeklyRanking>) =>
  entries.map(({ memberId, steps, rank }) => [rank, memberId, steps.value]);

describe('accountDailySteps', () => {
  it('garde, pour chaque jour, le plus grand total parmi les appareils du compte', () => {
    const phone = [day('2026-11-02', 8_000), day('2026-11-03', 3_000)];
    const watch = [day('2026-11-02', 7_500), day('2026-11-03', 6_000), day('2026-11-04', 1_000)];

    expect(plain(accountDailySteps([phone, watch]))).toEqual([
      ['2026-11-02', 8_000],
      ['2026-11-03', 6_000],
      ['2026-11-04', 1_000],
    ]);
  });

  it('renvoie les jours dans l’ordre, quel que soit l’ordre des appareils et de leurs jours', () => {
    const phone = [day('2026-11-04', 1_000), day('2026-11-02', 2_000)];
    const watch = [day('2026-11-03', 3_000)];

    expect(plain(accountDailySteps([phone, watch])).map(([date]) => date)).toEqual([
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
    ]);
  });

  it('ne compte jamais deux fois les pas d’un jour, même avec deux appareils identiques', () => {
    fc.assert(
      fc.property(fc.array(fc.nat({ max: 30_000 }), { minLength: 1, maxLength: 5 }), (totals) => {
        const devices = totals.map((steps) => [day('2026-11-02', steps)]);

        expect(plain(accountDailySteps(devices))).toEqual([['2026-11-02', Math.max(...totals)]]);
      }),
    );
  });
});

describe('weeklyRanking', () => {
  it('classe les membres par total de la semaine, du plus grand au plus petit', () => {
    const ranking = weeklyRanking(week(), [
      { memberId: 'zoe', devices: [[day('2026-11-02', 9_000), day('2026-11-03', 9_000)]] },
      { memberId: 'paul', devices: [[day('2026-11-04', 25_000)]] },
      { memberId: 'lea', devices: [] },
    ]);

    expect(ranked(ranking)).toEqual([
      [1, 'paul', 25_000],
      [2, 'zoe', 18_000],
      [3, 'lea', 0],
    ]);
  });

  it('ne compte que les jours de la semaine, du lundi au dimanche inclus', () => {
    const ranking = weeklyRanking(week(), [
      {
        memberId: 'zoe',
        devices: [
          [
            day('2026-11-01', 50_000),
            day('2026-11-02', 1_000),
            day('2026-11-08', 2_000),
            day('2026-11-09', 50_000),
          ],
        ],
      },
    ]);

    expect(ranked(ranking)).toEqual([[1, 'zoe', 3_000]]);
  });

  it('applique le maximum par jour entre les appareils d’un même membre', () => {
    const ranking = weeklyRanking(week(), [
      {
        memberId: 'zoe',
        devices: [[day('2026-11-02', 8_000)], [day('2026-11-02', 7_000), day('2026-11-03', 500)]],
      },
    ]);

    expect(ranked(ranking)).toEqual([[1, 'zoe', 8_500]]);
  });

  it('donne le même rang aux ex æquo, puis saute les rangs (1, 1, 3), ordre stable par membre', () => {
    const ranking = weeklyRanking(week(), [
      { memberId: 'zoe', devices: [[day('2026-11-02', 10_000)]] },
      { memberId: 'ana', devices: [[day('2026-11-03', 10_000)]] },
      { memberId: 'paul', devices: [[day('2026-11-04', 4_000)]] },
    ]);

    expect(ranked(ranking)).toEqual([
      [1, 'ana', 10_000],
      [1, 'zoe', 10_000],
      [3, 'paul', 4_000],
    ]);
  });

  it('ne dépend pas de l’ordre des membres ni de celui de leurs appareils', () => {
    const member = fc.record({
      memberId: fc.constantFrom('a', 'b', 'c', 'd', 'e'),
      devices: fc.array(
        fc.uniqueArray(
          fc.record({ offset: fc.integer({ min: -2, max: 8 }), steps: fc.nat({ max: 20_000 }) }),
          { selector: ({ offset }) => offset, maxLength: 9 },
        ),
        { maxLength: 3 },
      ),
    });
    fc.assert(
      fc.property(fc.uniqueArray(member, { selector: ({ memberId }) => memberId }), (members) => {
        const input = members.map(({ memberId, devices }) => ({
          memberId,
          devices: devices.map((days) =>
            days.map(({ offset, steps }) =>
              day(unwrap(LocalDate.create('2026-11-02')).plusDays(offset).toString(), steps),
            ),
          ),
        }));
        const reversed = [...input]
          .reverse()
          .map((entry) => ({ ...entry, devices: [...entry.devices].reverse() }));

        expect(ranked(weeklyRanking(week(), reversed))).toEqual(
          ranked(weeklyRanking(week(), input)),
        );
      }),
    );
  });
});
