import { describe, expect, it } from 'vitest';
import { LocalDate } from '../model/LocalDate';
import { unwrap } from '../testing/unwrap';
import { closableWeek } from './closableWeek';

const date = (iso: string) => unwrap(LocalDate.create(iso));

describe('closableWeek', () => {
  it.each([
    // La semaine 45 finit le dimanche 8 novembre 2026 : close à partir du mercredi 11.
    ['2026-11-09', '2026-W44'],
    ['2026-11-10', '2026-W44'],
    ['2026-11-11', '2026-W45'],
    ['2026-11-15', '2026-W45'],
    ['2026-11-18', '2026-W46'],
    // Changement d'année : la semaine 53 de 2026 finit le dimanche 3 janvier 2027.
    ['2027-01-05', '2026-W52'],
    ['2027-01-06', '2026-W53'],
  ])('le %s, la dernière semaine close est %s', (today, expected) => {
    expect(closableWeek(date(today)).toString()).toBe(expected);
  });
});
