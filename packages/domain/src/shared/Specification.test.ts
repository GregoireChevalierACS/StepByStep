import { describe, expect, it } from 'vitest';
import { specification } from './Specification';

const isEven = specification((n: number) => n % 2 === 0);
const isPositive = specification((n: number) => n > 0);

describe('Specification', () => {
  it('dit si un candidat satisfait la règle', () => {
    expect(isEven.isSatisfiedBy(4)).toBe(true);
    expect(isEven.isSatisfiedBy(3)).toBe(false);
  });

  it.each([
    [4, true],
    [-4, false],
    [3, false],
    [-3, false],
  ])('and : %s est pair et positif → %s', (n, expected) => {
    expect(isEven.and(isPositive).isSatisfiedBy(n)).toBe(expected);
  });

  it.each([
    [4, true],
    [-4, true],
    [3, true],
    [-3, false],
  ])('or : %s est pair ou positif → %s', (n, expected) => {
    expect(isEven.or(isPositive).isSatisfiedBy(n)).toBe(expected);
  });

  it('not : inverse la règle', () => {
    expect(isEven.not().isSatisfiedBy(3)).toBe(true);
    expect(isEven.not().isSatisfiedBy(4)).toBe(false);
  });

  it('se compose en chaîne', () => {
    const isOddAndPositive = isEven.not().and(isPositive);

    expect(isOddAndPositive.isSatisfiedBy(3)).toBe(true);
    expect(isOddAndPositive.isSatisfiedBy(4)).toBe(false);
    expect(isOddAndPositive.isSatisfiedBy(-3)).toBe(false);
  });
});
