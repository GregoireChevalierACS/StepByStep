import { describe, expect, it } from 'vitest';
import { unwrap } from '../testing/unwrap';
import { LocalDate } from './LocalDate';

describe('LocalDate', () => {
  it('accepte une date ISO valide', () => {
    expect(unwrap(LocalDate.create('2026-10-06')).toString()).toBe('2026-10-06');
  });

  it.each(['2026-02-30', '2026-13-01', '2026-10-6', '06/10/2026', ''])(
    'refuse une date invalide : "%s"',
    (value) => {
      expect(LocalDate.create(value)).toEqual({
        ok: false,
        error: { kind: 'InvalidLocalDate', value },
      });
    },
  );

  it.each([
    ['2026-10-06', '2026-10-07'],
    ['2026-10-31', '2026-11-01'],
    ['2026-12-31', '2027-01-01'],
    ['2028-02-28', '2028-02-29'],
    ['2026-02-28', '2026-03-01'],
  ])('le lendemain de %s est %s', (day, nextDay) => {
    expect(unwrap(LocalDate.create(day)).next().toString()).toBe(nextDay);
  });

  it.each([
    ['2026-10-07', '2026-10-06'],
    ['2026-11-01', '2026-10-31'],
    ['2027-01-01', '2026-12-31'],
    ['2028-03-01', '2028-02-29'],
    ['2026-03-01', '2026-02-28'],
  ])('la veille de %s est %s', (day, previousDay) => {
    expect(unwrap(LocalDate.create(day)).previous().toString()).toBe(previousDay);
  });

  it('compare deux dates par leur valeur', () => {
    const date = unwrap(LocalDate.create('2026-10-06'));

    expect(date.equals(unwrap(LocalDate.create('2026-10-06')))).toBe(true);
    expect(date.equals(date.next())).toBe(false);
  });

  it.each([
    ['2026-10-06', '2026-10-07', -1],
    ['2026-10-07', '2026-10-06', 1],
    ['2026-10-06', '2026-10-06', 0],
    ['2026-12-31', '2027-01-01', -1],
    ['2026-09-30', '2026-10-01', -1],
  ])('compare %s à %s dans l’ordre chronologique → %i', (a, b, expected) => {
    expect(Math.sign(unwrap(LocalDate.create(a)).compareTo(unwrap(LocalDate.create(b))))).toBe(
      expected,
    );
  });
});
