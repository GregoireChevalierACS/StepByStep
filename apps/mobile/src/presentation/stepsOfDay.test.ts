import { describe, expect, it } from 'vitest';

import { localDay, stepsOfDay } from './stepsOfDay';

const report = (days: unknown) => ({
  status: 200,
  body: { accepted: 1, duplicates: 0, days },
});

describe('localDay', () => {
  it('donne le jour local de l’instant dans le fuseau, pas le jour UTC', () => {
    // 2026-10-12T23:30Z : déjà le 13 à Paris (UTC+2), encore le 12 à New York (UTC-4).
    const instant = Date.UTC(2026, 9, 12, 23, 30);

    expect(localDay(instant, 'Europe/Paris')).toBe('2026-10-13');
    expect(localDay(instant, 'America/New_York')).toBe('2026-10-12');
  });
});

describe('stepsOfDay', () => {
  it('renvoie les pas du jour demandé parmi les jours recalculés', () => {
    const response = report([
      { day: '2026-10-11', steps: 812 },
      { day: '2026-10-12', steps: 4200 },
    ]);

    expect(stepsOfDay(response, '2026-10-12')).toBe(4200);
  });

  it('ne renvoie rien quand le jour n’a pas été recalculé', () => {
    expect(stepsOfDay(report([{ day: '2026-10-11', steps: 812 }]), '2026-10-12')).toBeUndefined();
  });

  it('ignore un élément mal formé', () => {
    expect(
      stepsOfDay(report([{ day: '2026-10-12', steps: '4200' }]), '2026-10-12'),
    ).toBeUndefined();
  });

  it('ne lit que les comptes rendus réussis', () => {
    const response = { status: 422, body: { days: [{ day: '2026-10-12', steps: 1 }] } };

    expect(stepsOfDay(response, '2026-10-12')).toBeUndefined();
  });

  it('ne renvoie rien sans liste de jours', () => {
    expect(stepsOfDay({ status: 200, body: null }, '2026-10-12')).toBeUndefined();
    expect(stepsOfDay({ status: 200, body: { days: 'aucun' } }, '2026-10-12')).toBeUndefined();
  });
});
