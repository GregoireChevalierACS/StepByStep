import { describe, expect, it } from 'vitest';
import { Distance } from '../model/Distance';
import { StepCount } from '../model/StepCount';
import { unwrap } from '../testing/unwrap';
import {
  FixedStrideLength,
  HeightBasedStrideLength,
  type StrideLengthStrategy,
} from './StrideLengthStrategy';

const meters = (value: number) => unwrap(Distance.ofMeters(value));
const tenThousandSteps = unwrap(StepCount.create(10_000));

describe('StrideLengthStrategy', () => {
  it('utilise une longueur de pas fixe', () => {
    const strategy: StrideLengthStrategy = new FixedStrideLength(meters(0.75));

    expect(strategy.strideLength().meters).toBe(0.75);
  });

  it('déduit la longueur de pas de la taille (taille × 0,415)', () => {
    const strategy: StrideLengthStrategy = new HeightBasedStrideLength(meters(1.8));

    expect(strategy.strideLength().meters).toBeCloseTo(0.747, 6);
  });

  it.each([
    ['fixe à 0,75 m', new FixedStrideLength(meters(0.75)), 7_500],
    ['pour une taille de 1,80 m', new HeightBasedStrideLength(meters(1.8)), 7_470],
  ])('donne la distance parcourue avec une longueur %s', (_label, strategy, expectedMeters) => {
    expect(strategy.strideLength().times(tenThousandSteps).meters).toBeCloseTo(expectedMeters, 6);
  });
});
