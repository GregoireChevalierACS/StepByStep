import { describe, expect, it } from 'vitest';
import { unwrap } from '../testing/unwrap';
import { Distance } from './Distance';
import { StepCount } from './StepCount';

describe('Distance', () => {
  it.each([0, 0.75, 1_234.5])('accepte une distance positive ou nulle en mètres : %s', (meters) => {
    expect(unwrap(Distance.ofMeters(meters)).meters).toBe(meters);
  });

  it.each([-0.01, Number.NaN, Number.POSITIVE_INFINITY])(
    'refuse une distance invalide : %s',
    (meters) => {
      expect(Distance.ofMeters(meters)).toEqual({
        ok: false,
        error: { kind: 'InvalidDistance', meters },
      });
    },
  );

  it('multiplie une longueur de pas par un nombre de pas', () => {
    const stride = unwrap(Distance.ofMeters(0.75));

    expect(stride.times(unwrap(StepCount.create(10_000))).meters).toBe(7_500);
  });

  it('se met à l’échelle d’un facteur positif', () => {
    expect(unwrap(Distance.ofMeters(2)).scaledBy(0.5).meters).toBe(1);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    'traite un facteur négatif ou non fini comme zéro : %s',
    (factor) => {
      expect(unwrap(Distance.ofMeters(2)).scaledBy(factor).meters).toBe(0);
    },
  );
});
