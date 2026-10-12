import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { configureApp } from '../configure-app.js';
import { recordReadingsBody } from '../readings/record-readings.dto.js';
import { openApiSchema } from './openapi.js';

type App = Parameters<typeof request>[0];

interface OpenApiDocument {
  openapi: string;
  paths: Record<
    string,
    Record<string, { requestBody?: { content: Record<string, { schema: unknown }> } }>
  >;
}

describe('documentation OpenAPI', () => {
  let app: INestApplication<App>;
  let document: OpenApiDocument;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication<INestApplication<App>>());
    await app.init();
    document = (await request(app.getHttpServer()).get('/v1/docs-json').expect(200))
      .body as OpenApiDocument;
  });

  afterAll(async () => {
    await app.close();
  });

  it('publie un document OpenAPI 3 qui décrit toutes les routes de l’API', () => {
    expect(document.openapi).toMatch(/^3\./);
    expect(
      Object.entries(document.paths)
        .flatMap(([path, methods]) => Object.keys(methods).map((method) => `${method} ${path}`))
        .sort(),
    ).toEqual([
      'get /v1/devices/{deviceId}/daily-steps',
      'get /v1/devices/{deviceId}/streak',
      'get /v1/health',
      'post /v1/devices',
      'post /v1/devices/{deviceId}/readings',
      'put /v1/accounts/{accountId}/goal',
    ]);
  });

  it('documente le corps des relevés avec le schéma zod qui le valide (source unique)', () => {
    const readings = document.paths['/v1/devices/{deviceId}/readings']?.['post'];

    expect(readings?.requestBody?.content['application/json']?.schema).toEqual(
      openApiSchema(recordReadingsBody),
    );
  });

  it('sert l’interface Swagger UI', async () => {
    await request(app.getHttpServer())
      .get('/v1/docs')
      .expect(200)
      .expect('Content-Type', /text\/html/);
  });
});
