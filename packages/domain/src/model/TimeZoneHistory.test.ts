import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { unwrap } from '../testing/unwrap';
import { TimeZoneHistory } from './TimeZoneHistory';
import { TimeZonePeriod } from './TimeZonePeriod';

const at = (isoUtc: string) => Date.parse(`${isoUtc}:00Z`);
const period = (timeZone: string, since: string) =>
  unwrap(TimeZonePeriod.create({ timeZone, since: at(since) }));
const summary = (history: TimeZoneHistory) =>
  history.periods.map(({ timeZone, since }) => ({ timeZone, since }));

// Fixtures paresseuses : créées pendant les tests, jamais au chargement du module.
// Voyage : Paris, puis New York le 10 octobre à 14 h UTC, puis retour à Paris le 20.
const paris = () => period('Europe/Paris', '2026-10-01T00:00');
const newYork = () => period('America/New_York', '2026-10-10T14:00');
const backToParis = () => period('Europe/Paris', '2026-10-20T08:00');

describe('TimeZoneHistory', () => {
  describe('construction', () => {
    it('refuse un historique vide', () => {
      expect(TimeZoneHistory.from([])).toEqual({
        ok: false,
        error: { kind: 'EmptyTimeZoneHistory' },
      });
    });

    it('range les périodes dans l’ordre chronologique, quel que soit l’ordre d’arrivée', () => {
      const history = () => unwrap(TimeZoneHistory.from([backToParis(), paris(), newYork()]));

      expect(summary(history())).toEqual(
        summary(unwrap(TimeZoneHistory.from([paris(), newYork(), backToParis()]))),
      );
      expect(history().periods.map(({ timeZone }) => timeZone)).toEqual([
        'Europe/Paris',
        'America/New_York',
        'Europe/Paris',
      ]);
    });

    it('ignore une période reçue en double', () => {
      expect(unwrap(TimeZoneHistory.from([paris(), newYork(), newYork()])).periods).toHaveLength(2);
    });

    it('ne garde que les changements : deux périodes successives du même fuseau n’en font qu’une', () => {
      const history = () =>
        unwrap(
          TimeZoneHistory.from([paris(), period('Europe/Paris', '2026-10-05T12:00'), newYork()]),
        );

      expect(summary(history())).toEqual(
        summary(unwrap(TimeZoneHistory.from([paris(), newYork()]))),
      );
    });

    it('refuse deux fuseaux différents au même instant', () => {
      const conflicting = period('Asia/Tokyo', '2026-10-10T14:00');

      expect(TimeZoneHistory.from([paris(), newYork(), conflicting])).toEqual({
        ok: false,
        error: {
          kind: 'ConflictingTimeZonePeriods',
          since: at('2026-10-10T14:00'),
          timeZones: ['America/New_York', 'Asia/Tokyo'],
        },
      });
    });
  });

  it('détecte une contradiction même quand l’une des deux périodes est redondante', () => {
    // New York le 5 est redondante (déjà New York depuis le 1er) : elle est fusionnée,
    // mais elle contredit toujours Paris au même instant. À instant égal, le tri place
    // « America/… » avant « Europe/… » : la période redondante est vue en premier.
    const newYorkFirst = period('America/New_York', '2026-10-01T00:00');
    const redundantNewYork = period('America/New_York', '2026-10-05T12:00');
    const parisSameInstant = period('Europe/Paris', '2026-10-05T12:00');

    expect(TimeZoneHistory.from([newYorkFirst, redundantNewYork, parisSameInstant])).toEqual({
      ok: false,
      error: {
        kind: 'ConflictingTimeZonePeriods',
        since: at('2026-10-05T12:00'),
        timeZones: ['America/New_York', 'Europe/Paris'],
      },
    });
  });

  describe('fuseau en vigueur à un instant', () => {
    const trip = () => unwrap(TimeZoneHistory.from([paris(), newYork(), backToParis()]));

    it.each([
      ['2026-10-05T12:00', 'Europe/Paris'],
      ['2026-10-10T13:59', 'Europe/Paris'],
      ['2026-10-10T14:00', 'America/New_York'],
      ['2026-10-15T09:00', 'America/New_York'],
      ['2026-10-25T09:00', 'Europe/Paris'],
    ])('à %s UTC, le fuseau est %s', (instant, timeZone) => {
      expect(trip().timeZoneAt(at(instant))).toBe(timeZone);
    });

    it('utilise le premier fuseau connu pour un instant antérieur à toute période', () => {
      expect(trip().timeZoneAt(at('2026-09-01T00:00'))).toBe('Europe/Paris');
    });
  });

  describe('enregistrement d’un changement de fuseau', () => {
    const history = () => unwrap(TimeZoneHistory.from([paris()]));

    it('ajoute une période quand le fuseau change', () => {
      const updated = unwrap(history().record(newYork()));

      expect(updated.timeZoneAt(at('2026-10-15T09:00'))).toBe('America/New_York');
      expect(history().periods).toHaveLength(1);
    });

    it('ne change rien quand le fuseau est le même que celui en vigueur', () => {
      const updated = unwrap(history().record(period('Europe/Paris', '2026-10-12T10:00')));

      expect(summary(updated)).toEqual(summary(history()));
    });

    it('signale un changement contradictoire avec une période connue', () => {
      expect(history().record(period('Asia/Tokyo', '2026-10-01T00:00'))).toEqual({
        ok: false,
        error: {
          kind: 'ConflictingTimeZonePeriods',
          since: at('2026-10-01T00:00'),
          timeZones: ['Asia/Tokyo', 'Europe/Paris'],
        },
      });
    });
  });

  it('ne dépend ni de l’ordre d’arrivée ni des doublons', () => {
    // Fuseaux tirés parmi 3, instants sur une grille d'une heure : les doublons
    // et les périodes successives d'un même fuseau sont fréquents.
    const anyPeriod = fc
      .record({
        timeZone: fc.constantFrom('Europe/Paris', 'America/New_York', 'Asia/Tokyo'),
        hour: fc.integer({ min: 0, max: 48 }),
      })
      .map(({ timeZone, hour }) =>
        unwrap(
          TimeZonePeriod.create({ timeZone, since: at('2026-10-01T00:00') + hour * 3_600_000 }),
        ),
      );
    // Une seule période par instant, pour éviter les contradictions (testées à part).
    const periodsWithoutConflict = fc.uniqueArray(anyPeriod, {
      minLength: 1,
      maxLength: 10,
      selector: ({ since }) => since,
    });

    fc.assert(
      fc.property(
        periodsWithoutConflict.chain((periods) =>
          fc.tuple(
            fc.constant(periods),
            fc.shuffledSubarray([...periods, ...periods], { minLength: periods.length * 2 }),
          ),
        ),
        ([periods, shuffledWithDuplicates]) => {
          const reference = unwrap(TimeZoneHistory.from(periods));
          const shuffled = unwrap(TimeZoneHistory.from(shuffledWithDuplicates));

          expect(summary(shuffled)).toEqual(summary(reference));
          // Jamais deux périodes successives du même fuseau.
          reference.periods.slice(1).forEach(({ timeZone }, index) => {
            expect(timeZone).not.toBe(reference.periods[index]?.timeZone);
          });
        },
      ),
    );
  });
});
