import { Inject, Injectable } from '@nestjs/common';
import { ACCOUNT_REPOSITORY, type AccountRepository } from './account.repository.js';

/**
 * Compte de l'utilisateur sur le serveur de synchronisation. La synchronisation est optionnelle
 * (ADR 0002, décision 2) : l'utilisateur peut à tout moment effacer ses données serveur.
 */
@Injectable()
export class AccountsService {
  constructor(@Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository) {}

  /**
   * Efface le compte et toutes ses données (décision 16). Idempotent : un compte déjà effacé
   * n'est pas une erreur, pour qu'une demande renvoyée après une coupure réseau aboutisse.
   */
  delete(accountId: string): Promise<void> {
    return this.accounts.delete(accountId);
  }
}
