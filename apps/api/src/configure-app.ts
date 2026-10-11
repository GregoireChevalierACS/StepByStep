import { type INestApplication, VersioningType } from '@nestjs/common';

/**
 * Configuration HTTP commune au démarrage réel (main.ts) et aux tests : les tests
 * vérifient ainsi exactement l'application qui tourne en production.
 */
export const configureApp = <T extends INestApplication>(app: T): T => {
  // Versionnement dans l'URL (/v1/…) : un changement incompatible créera /v2,
  // et /v1 restera servi tant que des apps l'utilisent (ADR 0002, décision 12).
  app.enableVersioning({ type: VersioningType.URI });
  return app;
};
