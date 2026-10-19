export interface RegisteredDevice {
  readonly accountId: string;
  readonly deviceId: string;
}

/**
 * Port de persistance des appareils et de leur compte. Les cas d'usage en dépendent sans
 * connaître la base : l'adapter PostgreSQL (TypeORM) sert en production, l'adapter en mémoire
 * dans les tests unitaires ; une même suite de contrat garantit qu'ils se comportent pareil.
 */
export interface DeviceRepository {
  /** Crée un compte et son premier appareil, atomiquement : jamais de compte sans appareil. */
  registerWithNewAccount(): Promise<RegisteredDevice>;
  exists(deviceId: string): Promise<boolean>;
}

/** Jeton d'injection NestJS : une interface TypeScript n'existe plus à l'exécution. */
export const DEVICE_REPOSITORY = Symbol('DEVICE_REPOSITORY');
