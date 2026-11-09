import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { unwrap } from '../testing/unwrap';
import { IsoWeek } from './IsoWeek';
import { LocalDate } from './LocalDate';

const date = (iso: string) => unwrap(LocalDate.create(iso));
const bounds = (value: string) => {
  const week = unwrap(IsoWeek.create(value));
  return [week.start.toString(), week.end.toString()];
};

describe('IsoWeek', () => {
  it.each([
    // Le 1er janvier 2026 est un jeudi : la semaine 1 commence le lundi 29 décembre 2025.
    ['2026-W01', '2025-12-29', '2026-01-04'],
    ['2026-W45', '2026-11-02', '2026-11-08'],
    // 2026 commence un jeudi : elle a 53 semaines, la dernière déborde sur 2027.
    ['2026-W53', '2026-12-28', '2027-01-03'],
    // Le 1er janvier 2027 est un vendredi : il appartient à la semaine 53 de 2026.
    ['2027-W01', '2027-01-04', '2027-01-10'],
    // 2020, bissextile, commence un mercredi : 53 semaines aussi.
    ['2020-W53', '2020-12-28', '2021-01-03'],
  ])('%s va du lundi %s au dimanche %s', (value, start, end) => {
    expect(bounds(value)).toEqual([start, end]);
  });

  it.each([
    '2025-W53',
    '2026-W54',
    '2026-W00',
    '2026-W5',
    '2026-45',
    '2026W45',
    'W45',
    '',
    '12026-W45',
    '2026-W451',
  ])('refuse une semaine qui n’existe pas ou mal écrite : %j', (value) => {
    expect(IsoWeek.create(value)).toEqual({
      ok: false,
      error: { kind: 'InvalidIsoWeek', value },
    });
  });

  it('contient ses sept jours, et seulement eux', () => {
    const week = unwrap(IsoWeek.create('2026-W45'));

    expect(week.contains(date('2026-11-01'))).toBe(false);
    expect(week.contains(date('2026-11-02'))).toBe(true);
    expect(week.contains(date('2026-11-08'))).toBe(true);
    expect(week.contains(date('2026-11-09'))).toBe(false);
  });

  it('s’écrit comme on l’a lue', () => {
    expect(unwrap(IsoWeek.create('2026-W05')).toString()).toBe('2026-W05');
  });

  it('enchaîne les semaines sans trou ni chevauchement, chacune d’un lundi à un dimanche', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1971, max: 2399 }),
        fc.integer({ min: 1, max: 52 }),
        (year, n) => {
          const week = (k: number) =>
            IsoWeek.create(`${String(year)}-W${String(k).padStart(2, '0')}`);
          const current = unwrap(week(n));
          const following = week(n + 1);
          const nextStart = following.ok
            ? following.value.start
            : unwrap(IsoWeek.create(`${String(year + 1)}-W01`)).start;

          expect(new Date(`${current.start.toString()}T00:00:00Z`).getUTCDay()).toBe(1);
          expect(current.end.next().toString()).toBe(nextStart.toString());
        },
      ),
    );
  });
});

describe('IsoWeek.containing et previous', () => {
  it.each([
    ['2026-11-02', '2026-W45'],
    ['2026-11-08', '2026-W45'],
    // Fin décembre ou début janvier : la semaine est celle de l'année de son jeudi.
    ['2025-12-29', '2026-W01'],
    ['2027-01-01', '2026-W53'],
    ['2027-01-03', '2026-W53'],
    ['2024-12-30', '2025-W01'],
  ])('%s est dans la semaine %s', (day, expected) => {
    expect(IsoWeek.containing(date(day)).toString()).toBe(expected);
  });

  it.each([
    ['2026-W45', '2026-W44'],
    ['2026-W01', '2025-W52'],
    ['2027-W01', '2026-W53'],
  ])('la semaine avant %s est %s', (value, expected) => {
    expect(unwrap(IsoWeek.create(value)).previous().toString()).toBe(expected);
  });

  it('contient toujours le jour dont elle est la semaine, et commence par son lundi', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 200_000 }), (days) => {
        const day = date('1971-01-01').plusDays(days);
        const week = IsoWeek.containing(day);

        expect(week.contains(day)).toBe(true);
        expect(IsoWeek.containing(week.start).toString()).toBe(week.toString());
        expect(unwrap(IsoWeek.create(week.toString())).start.toString()).toBe(
          week.start.toString(),
        );
      }),
    );
  });
});
