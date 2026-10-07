import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { StepCounterReading } from '../model/StepCounterReading';
import { FixedOffsetCalendar } from '../testing/FixedOffsetCalendar';
import { unwrap } from '../testing/unwrap';
import { distributeStepsByDay } from './distributeStepsByDay';

const paris = new FixedOffsetCalendar(120);

// Heure locale de Paris (UTC+2) → instant en millisecondes epoch.
const at = (localDateTime: string) => Date.parse(`${localDateTime}:00+02:00`);

const reading = (localDateTime: string, stepsSinceBoot: number, bootCount = 7) =>
  unwrap(StepCounterReading.create({ stepsSinceBoot, bootCount, takenAt: at(localDateTime) }));

const distribute = (previous: StepCounterReading, current: StepCounterReading, calendar = paris) =>
  unwrap(distributeStepsByDay(previous, current, calendar)).map(({ date, steps }) => ({
    date: date.toString(),
    steps: steps.value,
  }));

describe('distributeStepsByDay', () => {
  it('attribue tous les pas au jour quand les deux relevés sont le même jour', () => {
    expect(
      distribute(reading('2026-10-06T08:00', 4200), reading('2026-10-06T08:15', 5000)),
    ).toEqual([{ date: '2026-10-06', steps: 800 }]);
  });

  it('répartit au prorata du temps quand les relevés encadrent minuit', () => {
    expect(
      distribute(reading('2026-10-06T23:30', 1000), reading('2026-10-07T00:10', 1100)),
    ).toEqual([
      { date: '2026-10-06', steps: 75 },
      { date: '2026-10-07', steps: 25 },
    ]);
  });

  it('répartit sur chaque jour traversé quand les relevés sont espacés de plusieurs jours', () => {
    expect(distribute(reading('2026-10-06T18:00', 0), reading('2026-10-08T06:00', 3600))).toEqual([
      { date: '2026-10-06', steps: 600 },
      { date: '2026-10-07', steps: 2400 },
      { date: '2026-10-08', steps: 600 },
    ]);
  });

  it('attribue au jour précédent les pas d’un relevé pris pile à minuit', () => {
    expect(
      distribute(reading('2026-10-06T23:00', 1000), reading('2026-10-07T00:00', 1200)),
    ).toEqual([{ date: '2026-10-06', steps: 200 }]);
  });

  it('attribue au jour courant les pas de deux relevés pris au même instant', () => {
    expect(
      distribute(reading('2026-10-06T08:00', 4200, 7), reading('2026-10-06T08:00', 30, 8)),
    ).toEqual([{ date: '2026-10-06', steps: 30 }]);
  });

  it('tient compte d’un redémarrage entre deux relevés qui encadrent minuit', () => {
    expect(
      distribute(reading('2026-10-06T23:50', 4200, 7), reading('2026-10-07T00:10', 100, 8)),
    ).toEqual([
      { date: '2026-10-06', steps: 50 },
      { date: '2026-10-07', steps: 50 },
    ]);
  });

  it('place minuit selon le fuseau du calendrier local', () => {
    // 22:30 → 23:30 UTC : encore le 6 octobre en UTC, déjà le 7 à Paris (UTC+2).
    const previous = reading('2026-10-07T00:30', 1000);
    const current = reading('2026-10-07T01:30', 1100);

    expect(distribute(previous, current, new FixedOffsetCalendar(0))).toEqual([
      { date: '2026-10-06', steps: 100 },
    ]);
    expect(distribute(previous, current, paris)).toEqual([{ date: '2026-10-07', steps: 100 }]);
  });

  it('refuse deux relevés dans le désordre', () => {
    const previous = reading('2026-10-06T08:15', 5000);
    const current = reading('2026-10-06T08:00', 4200);

    expect(distributeStepsByDay(previous, current, paris)).toEqual({
      ok: false,
      error: {
        kind: 'ReadingsOutOfOrder',
        previousTakenAt: at('2026-10-06T08:15'),
        currentTakenAt: at('2026-10-06T08:00'),
      },
    });
  });

  it('répartit exactement les pas comptés, sur des jours consécutifs à partir du premier relevé', () => {
    const anyTime = fc.integer({ min: at('2026-01-01T00:00'), max: at('2027-01-01T00:00') });

    fc.assert(
      fc.property(
        anyTime,
        anyTime,
        fc.nat({ max: 100_000 }),
        fc.nat({ max: 100_000 }),
        (time1, time2, steps1, steps2) => {
          const previous = unwrap(
            StepCounterReading.create({
              stepsSinceBoot: steps1,
              bootCount: 7,
              takenAt: Math.min(time1, time2),
            }),
          );
          const current = unwrap(
            StepCounterReading.create({
              stepsSinceBoot: steps2,
              bootCount: 7,
              takenAt: Math.max(time1, time2),
            }),
          );

          const days = unwrap(distributeStepsByDay(previous, current, paris));
          const distributed = days.reduce((total, { steps }) => total + steps.value, 0);

          expect(distributed).toBe(current.stepsSince(previous).value);
          expect(days[0]?.date.equals(paris.dateOf(previous.takenAt))).toBe(true);
          days.slice(1).forEach(({ date }, index) => {
            expect(days[index]?.date.next().equals(date)).toBe(true);
          });
        },
      ),
    );
  });
});
