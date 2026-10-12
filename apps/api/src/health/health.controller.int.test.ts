import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { configureApp } from '../configure-app.js';

// Type du serveur HTTP attendu par supertest, déduit de son API publique (le sous-chemin
// 'supertest/types' n'est pas exposé par le champ `exports` du package).
type App = Parameters<typeof request>[0];

describe('GET /v1/health', () => {
  // Serveur HTTP typé (NestJS le type en `any` par défaut).
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    // Même configuration qu'en production (versionnement…) : on teste l'app réelle.
    app = configureApp(moduleRef.createNestApplication<INestApplication<App>>());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('répond que le service et sa base de données sont en ligne', async () => {
    await request(app.getHttpServer())
      .get('/v1/health')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({ status: 'ok', info: { database: { status: 'up' } } });
      });
  });

  it('n’expose pas de route sans version', async () => {
    await request(app.getHttpServer()).get('/health').expect(404);
  });
});
