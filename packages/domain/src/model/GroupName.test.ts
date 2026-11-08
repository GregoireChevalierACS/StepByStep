import { describe, expect, it } from 'vitest';
import { unwrap } from '../testing/unwrap';
import { GroupName } from './GroupName';

// Les règles d'affichage (caractères, normalisation) sont celles du pseudo, testées en détail
// dans Nickname.test.ts ; ici, ce qui est propre au nom de groupe.
describe('GroupName', () => {
  it.each(['Bureau', 'Les marcheurs du dimanche', 'abc', 'a'.repeat(30)])(
    'accepte un nom de 3 à 30 caractères : %s',
    (value) => {
      expect(unwrap(GroupName.create(value)).value).toBe(value);
    },
  );

  it('normalise le nom comme un pseudo', () => {
    expect(unwrap(GroupName.create('  Les   collègues ')).value).toBe('Les collègues');
  });

  it.each(['ab', 'a'.repeat(31)])(
    'refuse un nom de moins de 3 ou de plus de 30 caractères : %j',
    (value) => {
      expect(GroupName.create(value)).toEqual({
        ok: false,
        error: { kind: 'InvalidGroupName', value, reason: 'Length' },
      });
    },
  );

  it('refuse un caractère interdit', () => {
    expect(GroupName.create('<b>Bureau</b>')).toEqual({
      ok: false,
      error: { kind: 'InvalidGroupName', value: '<b>Bureau</b>', reason: 'Characters' },
    });
  });
});
