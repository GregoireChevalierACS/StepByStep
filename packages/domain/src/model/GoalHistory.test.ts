import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { unwrap } from '../testing/unwrap';
import { DailyGoal } from './DailyGoal';
import { type GoalChange, GoalHistory } from './GoalHistory';
import { LocalDate } from './LocalDate';

const date = (iso: string) => unwrap(LocalDate.create(iso));
const change = (steps: number, effectiveFrom: string): GoalChange => ({
  goal: unwrap(DailyGoal.create(steps)),
  effectiveFrom: date(effectiveFrom),
});
const summary = (history: GoalHistory) =>
  history.changes.map(
    ({ goal, effectiveFrom }) => `${String(goal.steps.value)}@${effectiveFrom.toString()}`,
  );
const goalOn = (history: GoalHistory, day: string) => history.goalOn(date(day)).steps.value;

// 10 000 pas depuis le 1er octobre, 12 000 à partir du 10.
const initial = change(10_000, '2026-10-01');
const raised = change(12_000, '2026-10-10');

describe('GoalHistory', () => {
  describe('construction', () => {
    it('refuse un historique vide', () => {
      expect(GoalHistory.from([])).toEqual({ ok: false, error: { kind: 'EmptyGoalHistory' } });
    });

    it('range les changements par date, quel que soit l’ordre d’arrivée, et ignore les doublons', () => {
      expect(summary(unwrap(GoalHistory.from([raised, initial, raised])))).toEqual([
        '10000@2026-10-01',
        '12000@2026-10-10',
      ]);
    });

    it('ne garde que les changements : un objectif identique au précédent est ignoré', () => {
      expect(
        summary(unwrap(GoalHistory.from([initial, change(10_000, '2026-10-05'), raised]))),
      ).toEqual(['10000@2026-10-01', '12000@2026-10-10']);
    });

    it('refuse deux objectifs différents à la même date, faute de savoir lequel est le dernier', () => {
      expect(GoalHistory.from([initial, raised, change(8_000, '2026-10-10')])).toEqual({
        ok: false,
        error: {
          kind: 'ConflictingGoalChanges',
          effectiveFrom: '2026-10-10',
          goals: [8_000, 12_000],
        },
      });
    });

    it('détecte une contradiction même quand l’un des deux objectifs est redondant', () => {
      // 8 000 le 10 est redondant avec le 8 000 du 1er (il est fusionné), mais il contredit 12 000.
      // À date égale, le tri place 8 000 avant 12 000 : le redondant est vu en premier.
      expect(
        GoalHistory.from([change(8_000, '2026-10-01'), change(8_000, '2026-10-10'), raised]),
      ).toEqual({
        ok: false,
        error: {
          kind: 'ConflictingGoalChanges',
          effectiveFrom: '2026-10-10',
          goals: [8_000, 12_000],
        },
      });
    });
  });

  describe('objectif d’un jour', () => {
    const history = unwrap(GoalHistory.from([initial, raised]));

    it.each([
      ['2026-10-01', 10_000],
      ['2026-10-09', 10_000],
      ['2026-10-10', 12_000],
      ['2026-11-15', 12_000],
    ])('le %s, l’objectif est de %i pas', (day, steps) => {
      expect(goalOn(history, day)).toBe(steps);
    });

    it('utilise le premier objectif connu pour un jour antérieur à tout changement', () => {
      expect(goalOn(history, '2026-09-15')).toBe(10_000);
    });
  });

  describe('enregistrement d’un nouvel objectif', () => {
    const history = unwrap(GoalHistory.from([initial]));

    it('applique le nouvel objectif à partir de sa date, sans réécrire le passé', () => {
      const updated = unwrap(history.record(raised));

      expect(goalOn(updated, '2026-10-09')).toBe(10_000);
      expect(goalOn(updated, '2026-10-10')).toBe(12_000);
      expect(summary(history)).toEqual(['10000@2026-10-01']);
    });

    it('remplace l’objectif déjà fixé le même jour : la dernière décision l’emporte', () => {
      const updated = unwrap(
        unwrap(history.record(change(8_000, '2026-10-10'))).record(change(12_000, '2026-10-10')),
      );

      expect(summary(updated)).toEqual(['10000@2026-10-01', '12000@2026-10-10']);
    });

    it('revenir le même jour à l’objectif précédent annule le changement', () => {
      const updated = unwrap(unwrap(history.record(raised)).record(change(10_000, '2026-10-10')));

      expect(summary(updated)).toEqual(['10000@2026-10-01']);
    });

    it('ne change rien quand l’objectif est identique à celui en vigueur', () => {
      expect(summary(unwrap(history.record(change(10_000, '2026-10-12'))))).toEqual(
        summary(history),
      );
    });
  });

  it('ne dépend ni de l’ordre d’arrivée ni des doublons', () => {
    // Objectifs parmi 3 valeurs, dates sur 20 jours : redondances et doublons fréquents.
    const anyChange = fc
      .record({
        steps: fc.constantFrom(8_000, 10_000, 12_000),
        day: fc.integer({ min: 1, max: 20 }),
      })
      .map(({ steps, day }) => change(steps, `2026-10-${String(day).padStart(2, '0')}`));
    // Une seule valeur par date, pour éviter les contradictions (testées à part).
    const changesWithoutConflict = fc.uniqueArray(anyChange, {
      minLength: 1,
      maxLength: 10,
      selector: ({ effectiveFrom }) => effectiveFrom.toString(),
    });

    fc.assert(
      fc.property(
        changesWithoutConflict.chain((changes) =>
          fc.tuple(
            fc.constant(changes),
            fc.shuffledSubarray([...changes, ...changes], { minLength: changes.length * 2 }),
          ),
        ),
        ([changes, shuffledWithDuplicates]) => {
          const reference = unwrap(GoalHistory.from(changes));

          expect(summary(unwrap(GoalHistory.from(shuffledWithDuplicates)))).toEqual(
            summary(reference),
          );
          reference.changes.slice(1).forEach(({ goal }, index) => {
            expect(goal.steps.value).not.toBe(reference.changes[index]?.goal.steps.value);
          });
        },
      ),
    );
  });
});
