import { describe, expect, it } from 'vitest';
import { metricValue, testMetrics } from '../testing/metrics.js';

describe('Metrics', () => {
  it('compte comme réussi le passage de clôture qu’une autre instance faisait déjà', async () => {
    const metrics = testMetrics({ now: () => Date.parse('2026-11-11T08:00:00Z') });

    metrics.closingPassSucceeded(undefined);

    expect(await metricValue(metrics, 'stepbystep_challenge_groups_closed_total')).toBe(0);
    expect(
      await metricValue(metrics, 'stepbystep_challenge_closing_last_success_timestamp_seconds'),
    ).toBe(Date.parse('2026-11-11T08:00:00Z') / 1000);
  });

  it('range sous une seule étiquette les URL qu’aucune route ne sert', async () => {
    const metrics = testMetrics();

    // Trois URL inconnues différentes (le middleware ne transmet jamais l'URL, seulement null).
    for (let i = 0; i < 3; i += 1) {
      metrics.requestHandled({ method: 'GET', route: null, status: 404, durationMs: 3 });
    }

    expect(
      await metricValue(metrics, 'stepbystep_http_request_duration_seconds_count', {
        route: 'unmatched',
        status: '404',
      }),
    ).toBe(3);
    expect(
      await metricValue(metrics, 'stepbystep_http_request_duration_seconds_sum', {
        route: 'unmatched',
      }),
    ).toBeCloseTo(0.009);
  });
});
