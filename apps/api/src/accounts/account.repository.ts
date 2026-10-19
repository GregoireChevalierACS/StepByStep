/** Port de persistance des comptes (voir DeviceRepository). */
export interface AccountRepository {
  exists(accountId: string): Promise<boolean>;
}

export const ACCOUNT_REPOSITORY = Symbol('ACCOUNT_REPOSITORY');
