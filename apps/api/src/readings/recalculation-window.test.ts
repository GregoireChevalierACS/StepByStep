import { describe, expect, it } from 'vitest';
import { unwrap } from '../testing/unwrap.js';
import { IntlLocalCalendar } from '../time/intl-local-calendar.js';
import { recalculationWindow } from './recalculation-window.js';

const paris = unwrap(IntlLocalCalendar.for('Europe/Paris'));
const at = (iso: string) => Date.parse(iso);

const window = (input: Parameters<typeof recalculationWindow>[0]) => {
  const { firstDay, lastDay, from, to } = recalculationWindow(input, paris);
  return {
    firstDay: firstDay.toString(),
    lastDay: lastDay.toString(),
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
  };
};

describe('recalculationWindow', () => {
  it('couvre la journée entière du relevé ajouté, sans voisin', () => {
    expect(window({ changedInstants: [at('2026-10-12T08:00:00Z')] })).toEqual({
      firstDay: '2026-10-12',
      lastDay: '2026-10-12',
      from: '2026-10-11T22:00:00.000Z', // minuit à Paris (UTC+2)
      to: '2026-10-12T22:00:00.000Z', // minuit du lendemain
    });
  });

  it('s’étend aux jours des relevés voisins, dont les paires changent', () => {
    expect(
      window({
        changedInstants: [at('2026-10-12T08:00:00Z')],
        previousNeighbor: at('2026-10-10T20:00:00Z'),
        nextNeighbor: at('2026-10-13T06:00:00Z'),
      }),
    ).toMatchObject({ firstDay: '2026-10-10', lastDay: '2026-10-13' });
  });

  it('englobe tous les instants modifiés, quel que soit leur ordre', () => {
    expect(
      window({ changedInstants: [at('2026-10-14T08:00:00Z'), at('2026-10-11T08:00:00Z')] }),
    ).toMatchObject({ firstDay: '2026-10-11', lastDay: '2026-10-14' });
  });

  it('suit le calendrier local : 23 h 30 UTC est déjà le lendemain à Paris', () => {
    expect(window({ changedInstants: [at('2026-10-12T23:30:00Z')] })).toMatchObject({
      firstDay: '2026-10-13',
      lastDay: '2026-10-13',
    });
  });

  it('refuse une liste d’instants vide (aucun recalcul n’a de sens)', () => {
    expect(() => recalculationWindow({ changedInstants: [] }, paris)).toThrow();
  });
});
