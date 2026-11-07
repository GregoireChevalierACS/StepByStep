import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { unwrap } from '../testing/unwrap';
import { Nickname } from './Nickname';

describe('Nickname', () => {
  it.each(['Zoé', 'Ørjan', 'marie_99', 'J.-P. Dupont', "O'Neil", '李小龍', 'abc', 'a'.repeat(20)])(
    'accepte un pseudo valide : %s',
    (value) => {
      expect(unwrap(Nickname.create(value)).value).toBe(value);
    },
  );

  it.each([
    ['  Zoé  ', 'Zoé'],
    ['Jean   Paul', 'Jean Paul'],
    ['Jean Paul', 'Jean Paul'],
    // « é » en deux points de code (e + accent combinant) devient un seul : forme NFC.
    ['Zoé', 'Zoé'],
  ])('normalise %j en %j', (value, normalized) => {
    expect(unwrap(Nickname.create(value)).value).toBe(normalized);
  });

  it.each(['', 'ab', '   ab   ', 'a'.repeat(21)])(
    'refuse un pseudo de moins de 3 ou de plus de 20 caractères : %j',
    (value) => {
      expect(Nickname.create(value)).toEqual({
        ok: false,
        error: { kind: 'InvalidNickname', value, reason: 'Length' },
      });
    },
  );

  it('compte les caractères, pas les unités UTF-16 (idéogramme hors du plan de base)', () => {
    expect(Nickname.create('李'.repeat(20)).ok).toBe(true);
    expect(Nickname.create('𠀀'.repeat(20)).ok).toBe(true);
    expect(Nickname.create('𠀀'.repeat(21)).ok).toBe(false);
  });

  it.each(['<script>', 'zoé@mail', 'a\u0000bc', 'ab\ncd', '-zoé', '.zoé', 'zoé😀'])(
    'refuse un caractère interdit ou un début qui n’est ni lettre ni chiffre : %j',
    (value) => {
      expect(Nickname.create(value)).toEqual({
        ok: false,
        error: { kind: 'InvalidNickname', value, reason: 'Characters' },
      });
    },
  );

  it('est stable : un pseudo accepté, recréé à partir de sa valeur, reste identique', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme', maxLength: 30 }), (raw) => {
        const nickname = Nickname.create(raw);
        if (!nickname.ok) return;

        expect(unwrap(Nickname.create(nickname.value.value)).value).toBe(nickname.value.value);
      }),
    );
  });
});
