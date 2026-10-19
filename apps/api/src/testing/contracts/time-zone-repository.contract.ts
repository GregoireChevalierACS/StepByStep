import { TimeZonePeriod } from '@stepbystep/domain';
import { expect, it } from 'vitest';
import type { TimeZoneRepository } from '../../time/time-zone.repository.js';
import { unwrap } from '../unwrap.js';

export interface TimeZoneRepositoryFixture {
  readonly repository: TimeZoneRepository;
  readonly givenDevice: () => Promise<string>;
  readonly givenPeriods: (deviceId: string, periods: readonly TimeZonePeriod[]) => Promise<void>;
}

const period = (timeZone: string, since: string) =>
  unwrap(TimeZonePeriod.create({ timeZone, since: Date.parse(since) }));
// Ordre indifférent (voir le port) : on compare des listes triées par début.
const asPlain = (periods: readonly TimeZonePeriod[]) =>
  periods
    .map(({ timeZone, since }) => ({ timeZone, since: new Date(since).toISOString() }))
    .sort((a, b) => a.since.localeCompare(b.since));

/** Contrat du port TimeZoneRepository (voir deviceRepositoryContract). */
export const timeZoneRepositoryContract = (fixture: () => TimeZoneRepositoryFixture): void => {
  it('restitue les périodes de fuseau de l’appareil, à la milliseconde près', async () => {
    const { repository, givenDevice, givenPeriods } = fixture();
    const deviceId = await givenDevice();
    await givenPeriods(deviceId, [
      period('America/New_York', '2026-10-06T20:00:00.123Z'),
      period('Europe/Paris', '2026-10-01T00:00:00.000Z'),
    ]);

    expect(asPlain(await repository.periodsOf(deviceId))).toEqual([
      { timeZone: 'Europe/Paris', since: '2026-10-01T00:00:00.000Z' },
      { timeZone: 'America/New_York', since: '2026-10-06T20:00:00.123Z' },
    ]);
  });

  it('ne renvoie rien pour un appareil sans fuseau, ni les fuseaux d’un autre appareil', async () => {
    const { repository, givenDevice, givenPeriods } = fixture();
    const deviceId = await givenDevice();
    const otherDeviceId = await givenDevice();
    await givenPeriods(otherDeviceId, [period('Europe/Paris', '2026-10-01T00:00:00.000Z')]);

    expect(await repository.periodsOf(deviceId)).toEqual([]);
  });
};
