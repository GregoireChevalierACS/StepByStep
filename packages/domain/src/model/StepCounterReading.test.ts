import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { unwrap } from '../testing/unwrap';
import { StepCounterReading } from './StepCounterReading';

// 2026-10-06T08:00:00Z
const TAKEN_AT = Date.UTC(2026, 9, 6, 8);

describe('StepCounterReading', () => {
  describe('création', () => {
    it('accepte un relevé avec un compteur, un numéro de démarrage et un horodatage valides', () => {
      const reading = unwrap(
        StepCounterReading.create({ stepsSinceBoot: 4200, bootCount: 7, takenAt: TAKEN_AT }),
      );

      expect(reading.stepsSinceBoot.value).toBe(4200);
      expect(reading.bootCount).toBe(7);
      expect(reading.takenAt).toBe(TAKEN_AT);
    });

    it('refuse un compteur de pas invalide en précisant la cause', () => {
      const result = StepCounterReading.create({
        stepsSinceBoot: -1,
        bootCount: 7,
        takenAt: TAKEN_AT,
      });

      expect(result).toEqual({
        ok: false,
        error: {
          kind: 'InvalidStepsSinceBoot',
          cause: { kind: 'NegativeStepCount', value: -1 },
        },
      });
    });

    it.each([-1, 1.5, Number.NaN])('refuse un numéro de démarrage invalide : %s', (bootCount) => {
      const result = StepCounterReading.create({
        stepsSinceBoot: 4200,
        bootCount,
        takenAt: TAKEN_AT,
      });

      expect(result).toEqual({ ok: false, error: { kind: 'InvalidBootCount', value: bootCount } });
    });

    it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
      'refuse un horodatage invalide : %s',
      (takenAt) => {
        const result = StepCounterReading.create({ stepsSinceBoot: 4200, bootCount: 7, takenAt });

        expect(result).toEqual({ ok: false, error: { kind: 'InvalidTakenAt', value: takenAt } });
      },
    );
  });

  describe('pas comptés depuis le relevé précédent', () => {
    const reading = (stepsSinceBoot: number, bootCount = 7) =>
      unwrap(StepCounterReading.create({ stepsSinceBoot, bootCount, takenAt: TAKEN_AT }));

    it("compte l'écart entre deux relevés du même démarrage", () => {
      expect(reading(5000).stepsSince(reading(4200)).value).toBe(800);
    });

    it("compte zéro pas quand le compteur n'a pas bougé", () => {
      expect(reading(4200).stepsSince(reading(4200)).value).toBe(0);
    });

    it('après un redémarrage, compte les pas faits depuis ce démarrage', () => {
      expect(reading(300, 8).stepsSince(reading(4200, 7)).value).toBe(300);
    });

    it('détecte un redémarrage même si le compteur a dépassé le relevé précédent', () => {
      expect(reading(5000, 8).stepsSince(reading(100, 7)).value).toBe(5000);
    });

    it('traite un compteur qui baisse sans changement de démarrage comme une remise à zéro', () => {
      expect(reading(300).stepsSince(reading(4200)).value).toBe(300);
    });

    it("sur une suite de relevés avec redémarrages, ne compte ni n'invente aucun pas", () => {
      // Chaque démarrage = une suite d'incréments de pas entre deux relevés. Le compteur
      // du premier démarrage part d'une valeur quelconque, ceux des suivants partent de 0.
      const increments = fc.array(fc.nat({ max: 10_000 }), { minLength: 1, maxLength: 20 });
      const boots = fc.array(increments, { minLength: 1, maxLength: 5 });

      fc.assert(
        fc.property(fc.nat({ max: 100_000 }), boots, (firstBootStart, bootIncrements) => {
          const readings = bootIncrements.flatMap((stepIncrements, bootIndex) => {
            let counter = bootIndex === 0 ? firstBootStart : 0;
            return stepIncrements.map((increment) => {
              counter += increment;
              return reading(counter, 7 + bootIndex);
            });
          });

          let counted = 0;
          readings.reduce((previous, current) => {
            counted += current.stepsSince(previous).value;
            return current;
          });

          // Le premier relevé sert de référence : son incrément n'est pas compté.
          const walked = bootIncrements.flat().reduce((total, step) => total + step, 0);
          const reference = bootIncrements[0]?.[0] ?? 0;
          expect(counted).toBe(walked - reference);
        }),
      );
    });
  });
});
