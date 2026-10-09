import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { StepCounterReading } from '../model/StepCounterReading';
import { FixedOffsetCalendar } from '../testing/FixedOffsetCalendar';
import { unwrap } from '../testing/unwrap';
import { dailyStepsFromReadings } from './dailyStepsFromReadings';

const paris = new FixedOffsetCalendar(120);

// Heure locale de Paris (UTC+2) → instant en millisecondes epoch.
const at = (localDateTime: string) => Date.parse(`${localDateTime}:00+02:00`);

const reading = (localDateTime: string, stepsSinceBoot: number, bootCount = 7) =>
  unwrap(StepCounterReading.create({ stepsSinceBoot, bootCount, takenAt: at(localDateTime) }));

const daily = (readings: readonly StepCounterReading[]) =>
  dailyStepsFromReadings(readings, paris).map(({ date, steps }) => ({
    date: date.toString(),
    steps: steps.value,
  }));

describe('dailyStepsFromReadings', () => {
  it('ne renvoie rien avec moins de deux relevés', () => {
    expect(daily([])).toEqual([]);
    expect(daily([reading('2026-10-09T08:00', 4200)])).toEqual([]);
  });

  it('cumule par jour les pas de chaque paire de relevés consécutifs', () => {
    expect(
      daily([
        reading('2026-10-09T22:00', 1000),
        reading('2026-10-09T23:30', 1500),
        reading('2026-10-10T00:30', 2100),
      ]),
    ).toEqual([
      { date: '2026-10-09', steps: 800 },
      { date: '2026-10-10', steps: 300 },
    ]);
  });

  it('donne le même résultat quand les relevés arrivent dans le désordre', () => {
    expect(
      daily([
        reading('2026-10-10T00:30', 2100),
        reading('2026-10-09T22:00', 1000),
        reading('2026-10-09T23:30', 1500),
      ]),
    ).toEqual([
      { date: '2026-10-09', steps: 800 },
      { date: '2026-10-10', steps: 300 },
    ]);
  });

  it('ne compte qu’une fois un relevé reçu en double', () => {
    expect(
      daily([
        reading('2026-10-09T08:00', 4200),
        reading('2026-10-09T08:15', 5000),
        reading('2026-10-09T08:15', 5000),
      ]),
    ).toEqual([{ date: '2026-10-09', steps: 800 }]);
  });

  it('garde la plus grande valeur quand deux relevés du même instant se contredisent', () => {
    expect(
      daily([
        reading('2026-10-09T08:00', 4200),
        reading('2026-10-09T08:15', 5000),
        reading('2026-10-09T08:15', 5100),
      ]),
    ).toEqual([{ date: '2026-10-09', steps: 900 }]);
  });

  it('tient compte d’un redémarrage au milieu de la série', () => {
    expect(
      daily([
        reading('2026-10-09T22:00', 1000, 7),
        reading('2026-10-09T23:00', 200, 8),
        reading('2026-10-09T23:30', 500, 8),
      ]),
    ).toEqual([{ date: '2026-10-09', steps: 500 }]);
  });

  it('recalcule les jours voisins quand un relevé arrive en retard', () => {
    const before = [reading('2026-10-09T23:00', 1000), reading('2026-10-10T01:00', 3000)];
    const late = reading('2026-10-09T23:50', 2900);

    expect(daily(before)).toEqual([
      { date: '2026-10-09', steps: 1000 },
      { date: '2026-10-10', steps: 1000 },
    ]);
    // Le relevé de 23:50 révèle que presque tous les pas ont été faits avant minuit.
    expect(daily([...before, late])).toEqual([
      { date: '2026-10-09', steps: 1914 },
      { date: '2026-10-10', steps: 86 },
    ]);
  });

  describe('propriétés', () => {
    // Grille de 30 min sur 3 jours : des relevés simultanés (doublons, contradictions,
    // redémarrage au même instant) sont ainsi fréquents, ce qui n'arriverait jamais à la ms près.
    const anyInstant = fc
      .integer({ min: 0, max: 3 * 48 })
      .map((halfHours) => at('2026-10-09T00:00') + halfHours * 30 * 60_000);
    const anyReading = fc
      .record({
        stepsSinceBoot: fc.nat({ max: 50_000 }),
        bootCount: fc.integer({ min: 7, max: 8 }),
        takenAt: anyInstant,
      })
      .map((props) => unwrap(StepCounterReading.create(props)));

    it('ne dépend ni de l’ordre d’arrivée ni des doublons', () => {
      fc.assert(
        fc.property(
          fc.array(anyReading, { maxLength: 15 }).chain((readings) =>
            fc.tuple(
              fc.constant(readings),
              fc.shuffledSubarray([...readings, ...readings], {
                minLength: readings.length * 2,
              }),
            ),
          ),
          ([readings, shuffledWithDuplicates]) => {
            expect(daily(shuffledWithDuplicates)).toEqual(daily(readings));
          },
        ),
      );
    });

    it('sur un même démarrage, répartit exactement l’écart du compteur sur des jours consécutifs', () => {
      fc.assert(
        fc.property(
          fc.nat({ max: 100_000 }),
          fc.array(fc.tuple(fc.integer({ min: 1, max: 6 * 3_600_000 }), fc.nat({ max: 5_000 })), {
            minLength: 1,
            maxLength: 20,
          }),
          (firstCounter, intervals) => {
            let takenAt = at('2026-10-09T18:00');
            let counter = firstCounter;
            const readings = [
              unwrap(StepCounterReading.create({ stepsSinceBoot: counter, bootCount: 7, takenAt })),
            ];
            for (const [duration, walked] of intervals) {
              takenAt += duration;
              counter += walked;
              readings.push(
                unwrap(
                  StepCounterReading.create({ stepsSinceBoot: counter, bootCount: 7, takenAt }),
                ),
              );
            }

            const days = dailyStepsFromReadings(readings, paris);

            expect(days.reduce((total, { steps }) => total + steps.value, 0)).toBe(
              counter - firstCounter,
            );
            days.slice(1).forEach(({ date }, index) => {
              expect(days[index]?.date.next().equals(date)).toBe(true);
            });
          },
        ),
      );
    });
  });
});
