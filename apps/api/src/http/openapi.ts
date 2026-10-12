import { applyDecorators, type INestApplication } from '@nestjs/common';
import { ApiBody, ApiResponse, DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { z } from 'zod';
import { problemDetailsResponse } from './contract.js';

// Type de schéma attendu par @nestjs/swagger, déduit de son API publique (il n'est pas
// exporté par le point d'entrée du package). Sans les références ($ref) : nos schémas,
// générés par zod, sont toujours complets, et ApiParam/ApiQuery n'acceptent qu'eux.
type SchemaObject = Exclude<
  Extract<NonNullable<Parameters<typeof ApiBody>[0]>, { schema: unknown }>['schema'],
  { $ref: string }
>;

/**
 * Schéma zod → schéma OpenAPI 3.0. Le même schéma valide les requêtes et les documente :
 * le contrat publié ne peut pas diverger du code. `input` pour une requête (champs avec
 * valeur par défaut facultatifs), `output` pour une réponse.
 */
export const openApiSchema = (schema: z.ZodType, io: 'input' | 'output' = 'input'): SchemaObject =>
  // `as` : z.toJSONSchema (cible openapi-3.0) produit bien un schéma OpenAPI 3.0, mais son type
  // JSON Schema générique n'est pas relié au type SchemaObject de @nestjs/swagger.
  z.toJSONSchema(schema, { target: 'openapi-3.0', io }) as SchemaObject;

const ERROR_DESCRIPTIONS: Record<number, string> = {
  400: 'Requête mal formée (structure, types, formats)',
  404: 'Ressource inconnue',
  409: 'Conflit avec des données déjà enregistrées',
  422: 'Valeurs refusées par les règles métier',
};

/** Documente les réponses d'erreur, toutes au format Problem Details (RFC 9457). */
export const ApiProblems = (...statuses: number[]) =>
  applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: ERROR_DESCRIPTIONS[status] ?? 'Erreur',
        content: {
          'application/problem+json': { schema: openApiSchema(problemDetailsResponse, 'output') },
        },
      }),
    ),
  );

/** Publie le contrat : Swagger UI sur /v1/docs, document JSON sur /v1/docs-json. */
export const setupOpenApi = (app: INestApplication): void => {
  const config = new DocumentBuilder()
    .setTitle('StepByStep API')
    .setDescription(
      'Serveur de synchronisation optionnel (ADR 0002) : relevés du compteur de pas, pas par ' +
        'jour local, objectif quotidien, série et badges. Erreurs au format Problem Details.',
    )
    .setVersion('1')
    .build();
  SwaggerModule.setup('v1/docs', app, () => SwaggerModule.createDocument(app, config), {
    jsonDocumentUrl: 'v1/docs-json',
  });
};
