import { describe, expect, it } from 'vitest';

import { describeResponse } from './describeResponse';

describe('describeResponse', () => {
  it('résume un relevé accepté et les pas par jour recalculés', () => {
    const text = describeResponse({
      status: 200,
      body: {
        accepted: 1,
        duplicates: 0,
        days: [
          { day: '2026-10-11', steps: 812 },
          { day: '2026-10-12', steps: 4200 },
        ],
      },
    });

    expect(text).toBe(
      'Acceptés : 1 · doublons ignorés : 0\n' +
        'Pas par jour recalculés :\n' +
        '  2026-10-11 : 812\n' +
        '  2026-10-12 : 4200',
    );
  });

  it('signale un doublon qui ne recalcule aucun jour', () => {
    const text = describeResponse({ status: 200, body: { accepted: 0, duplicates: 1, days: [] } });

    expect(text).toBe('Acceptés : 0 · doublons ignorés : 1\nAucun jour recalculé.');
  });

  it('affiche le titre et le détail d’une erreur Problem Details', () => {
    const text = describeResponse({
      status: 404,
      body: {
        type: 'about:blank',
        title: 'Not Found',
        status: 404,
        detail: 'Appareil inconnu : x',
      },
    });

    expect(text).toBe('HTTP 404 Not Found : Appareil inconnu : x');
  });

  it('ajoute les erreurs de validation quand l’API les détaille', () => {
    const errors = [{ path: 'readings.0', message: 'InvalidBootCount' }];

    const text = describeResponse({
      status: 422,
      body: { title: 'Unprocessable Entity', detail: 'Valeurs refusées', errors },
    });

    expect(text).toBe(
      'HTTP 422 Unprocessable Entity : Valeurs refusées\n' + JSON.stringify(errors),
    );
  });

  it('affiche brute une réponse 200 qui n’a pas la forme attendue', () => {
    const body = { accepted: 1, duplicates: 0, days: [{ day: '2026-10-12' }] };

    expect(describeResponse({ status: 200, body })).toBe(
      `HTTP 200\n${JSON.stringify(body, null, 2)}`,
    );
  });

  it('affiche brute une réponse sans corps', () => {
    expect(describeResponse({ status: 502, body: null })).toBe('HTTP 502\nnull');
  });
});
