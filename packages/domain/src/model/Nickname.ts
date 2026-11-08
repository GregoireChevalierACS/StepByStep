import { err, ok, type Result } from '../shared/Result';
import { type DisplayNameProblem, normalizeDisplayName } from './displayName';

export interface InvalidNickname {
  readonly kind: 'InvalidNickname';
  readonly value: string;
  readonly reason: DisplayNameProblem;
}

/**
 * Pseudo du compte, affiché aux membres de ses groupes : 3 à 20 caractères, normalisé à la
 * création (voir normalizeDisplayName).
 */
export class Nickname {
  private constructor(readonly value: string) {}

  static create(value: string): Result<Nickname, InvalidNickname> {
    const normalized = normalizeDisplayName(value, 3, 20);
    if (!normalized.ok) return err({ kind: 'InvalidNickname', value, reason: normalized.reason });
    return ok(new Nickname(normalized.value));
  }
}
