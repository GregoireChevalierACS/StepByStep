import { dailyStepsFromReadings, StepCounterReading } from '@stepbystep/domain';
import { describe, expect, it } from 'vitest';
import { unwrap } from '../testing/unwrap.js';
import { IntlLocalCalendar } from './intl-local-calendar.js';

// Le domaine n'a été testé qu'avec un calendrier à décalage fixe : on vérifie ici qu'il
// fonctionne avec l'adapter réel, sur une nuit de changement d'heure.
describe('dailyStepsFromReadings avec le calendrier réel', () => {
  it('répartit au prorata sur la nuit de 25 h du retour à l’heure d’hiver (Paris)', () => {
    const paris = unwrap(IntlLocalCalendar.for('Europe/Paris'));
    const reading = (instant: string, stepsSinceBoot: number) =>
      unwrap(
        StepCounterReading.create({ stepsSinceBoot, bootCount: 7, takenAt: Date.parse(instant) }),
      );

    // Du samedi 24 octobre 22:00 (UTC+2) au dimanche 25 octobre 22:00 (UTC+1) :
    // 25 h réelles, dont 2 h le samedi et 23 h le dimanche.
    const days = dailyStepsFromReadings(
      [reading('2026-10-24T20:00:00Z', 0), reading('2026-10-25T21:00:00Z', 2_500)],
      paris,
    ).map(({ date, steps }) => ({ date: date.toString(), steps: steps.value }));

    expect(days).toEqual([
      { date: '2026-10-24', steps: 200 },
      { date: '2026-10-25', steps: 2_300 },
    ]);
  });
});
