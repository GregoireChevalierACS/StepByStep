import { type DailySteps, LocalDate, StepCount } from '@stepbystep/domain';
import { expect, it } from 'vitest';
import type { DailyStepsRepository } from '../../daily-steps/daily-steps.repository.js';
import { unwrap } from '../unwrap.js';

/** Ce dont le contrat a besoin : le port, et de quoi préparer des données par l'adapter testé. */
export interface DailyStepsRepositoryFixture {
  readonly repository: DailyStepsRepository;
  // Fonctions (et non méthodes) : le contrat les déstructure, sans `this` à préserver.
  readonly givenDevice: () => Promise<string>;
  readonly givenDays: (deviceId: string, days: readonly DailySteps[]) => Promise<void>;
}

const day = (date: string, steps: number): DailySteps => ({
  date: unwrap(LocalDate.create(date)),
  steps: unwrap(StepCount.create(steps)),
});
const date = (value: string) => unwrap(LocalDate.create(value));
const asPlain = (days: readonly DailySteps[]) =>
  days.map(({ date: d, steps }) => ({ day: d.toString(), steps: steps.value }));

/** Contrat du port DailyStepsRepository (voir deviceRepositoryContract). */
export const dailyStepsRepositoryContract = (fixture: () => DailyStepsRepositoryFixture): void => {
  it('renvoie les jours de la période, bornes incluses, triés par jour', async () => {
    const { repository, givenDevice, givenDays } = fixture();
    const deviceId = await givenDevice();
    await givenDays(deviceId, [
      day('2026-10-07', 700),
      day('2026-10-04', 400),
      day('2026-10-08', 800),
      day('2026-10-05', 500),
    ]);

    const days = await repository.between(deviceId, date('2026-10-05'), date('2026-10-07'));

    expect(asPlain(days)).toEqual([
      { day: '2026-10-05', steps: 500 },
      { day: '2026-10-07', steps: 700 },
    ]);
  });

  it('ne renvoie que les jours de l’appareil demandé', async () => {
    const { repository, givenDevice, givenDays } = fixture();
    const deviceId = await givenDevice();
    const otherDeviceId = await givenDevice();
    await givenDays(deviceId, [day('2026-10-05', 500)]);
    await givenDays(otherDeviceId, [day('2026-10-05', 9999)]);

    const days = await repository.between(deviceId, date('2026-10-05'), date('2026-10-05'));

    expect(asPlain(days)).toEqual([{ day: '2026-10-05', steps: 500 }]);
  });

  it('renvoie une liste vide quand aucun jour n’est enregistré sur la période', async () => {
    const { repository, givenDevice } = fixture();
    const deviceId = await givenDevice();

    expect(await repository.between(deviceId, date('2026-10-01'), date('2026-10-31'))).toEqual([]);
  });
};
