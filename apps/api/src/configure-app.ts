import { type INestApplication, VersioningType } from '@nestjs/common';
import { setupOpenApi } from './http/openapi.js';
import { ProblemDetailsFilter } from './http/problem-details.filter.js';

/**
 * Configuration HTTP commune au démarrage réel (main.ts) et aux tests : les tests
 * vérifient ainsi exactement l'application qui tourne en production.
 */
export const configureApp = <T extends INestApplication>(app: T): T => {
  // Versionnement dans l'URL (/v1/…) : un changement incompatible créera /v2,
  // et /v1 restera servi tant que des apps l'utilisent (ADR 0002, décision 12).
  app.enableVersioning({ type: VersioningType.URI });
  // Toutes les erreurs au format standard Problem Details (RFC 9457).
  app.useGlobalFilters(new ProblemDetailsFilter());
  // Contrat publié en OpenAPI, généré à partir des schémas zod.
  setupOpenApi(app);
  return app;
};
