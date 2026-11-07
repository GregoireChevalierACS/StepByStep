import { Inject, Injectable } from '@nestjs/common';
import { err, type InvalidNickname, Nickname, ok, type Result } from '@stepbystep/domain';
import type { AccountNotFound } from '../goals/goals.service.js';
import { ACCOUNT_REPOSITORY, type AccountRepository } from './account.repository.js';

/**
 * Compte de l'utilisateur sur le serveur de synchronisation. La synchronisation est optionnelle
 * (ADR 0002, décision 2) : l'utilisateur peut à tout moment effacer ses données serveur.
 */
@Injectable()
export class AccountsService {
  constructor(@Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository) {}

  /**
   * Fixe le pseudo du compte et renvoie sa forme normalisée (celle qu'afficheront les autres
   * membres). Idempotent : la même demande renvoyée laisse le même état.
   */
  async setNickname(
    accountId: string,
    value: string,
  ): Promise<Result<Nickname, InvalidNickname | AccountNotFound>> {
    const nickname = Nickname.create(value);
    if (!nickname.ok) return nickname;
    if (!(await this.accounts.exists(accountId))) {
      return err({ kind: 'AccountNotFound', accountId });
    }
    await this.accounts.setNickname(accountId, nickname.value);
    return ok(nickname.value);
  }

  /**
   * Efface le compte et toutes ses données (décision 16). Idempotent : un compte déjà effacé
   * n'est pas une erreur, pour qu'une demande renvoyée après une coupure réseau aboutisse.
   */
  delete(accountId: string): Promise<void> {
    return this.accounts.delete(accountId);
  }
}
