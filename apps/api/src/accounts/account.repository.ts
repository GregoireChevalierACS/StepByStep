/** Port de persistance des comptes (voir DeviceRepository). */
export interface AccountRepository {
  exists(accountId: string): Promise<boolean>;

  /**
   * Efface le compte et toutes ses données : appareils, relevés, fuseaux, objectifs, pas par
   * jour et événements de l'outbox. Tout ou rien. Sans effet sur un compte inconnu ou déjà
   * effacé : renvoyer la demande (après une coupure réseau…) ne produit pas d'erreur.
   */
  delete(accountId: string): Promise<void>;
}

export const ACCOUNT_REPOSITORY = Symbol('ACCOUNT_REPOSITORY');
