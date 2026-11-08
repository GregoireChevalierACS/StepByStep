import { err, ok, type Result } from '../shared/Result';
import { type DisplayNameProblem, normalizeDisplayName } from './displayName';

export interface InvalidGroupName {
  readonly kind: 'InvalidGroupName';
  readonly value: string;
  readonly reason: DisplayNameProblem;
}

/**
 * Nom d'un groupe d'amis, affiché à tous ses membres : 3 à 30 caractères, mêmes règles
 * d'affichage que le pseudo (voir normalizeDisplayName).
 */
export class GroupName {
  private constructor(readonly value: string) {}

  static create(value: string): Result<GroupName, InvalidGroupName> {
    const normalized = normalizeDisplayName(value, 3, 30);
    if (!normalized.ok) return err({ kind: 'InvalidGroupName', value, reason: normalized.reason });
    return ok(new GroupName(normalized.value));
  }
}
