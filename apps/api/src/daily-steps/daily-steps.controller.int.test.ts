import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { configureApp } from '../configure-app.js';

type App = Parameters<typeof request>[0];

describe('GET /v1/devices/:deviceId/daily-steps', () => {
  let app: INestApplication<App>;
  let deviceId: string;

  const get = (path: string) => request(app.getHttpServer()).get(path);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication<INestApplication<App>>());
    await app.init();

    // Données créées par l'API elle-même : 1000 pas le 12 et le 13 octobre (Paris),
    // puis 2000 pas le 15.
    deviceId = (
      (await request(app.getHttpServer()).post('/v1/devices').expect(201)).body as {
        deviceId: string;
      }
    ).deviceId;
    await request(app.getHttpServer())
      .post(`/v1/devices/${deviceId}/readings`)
      .send({
        readings: [
          { stepsSinceBoot: 1000, bootCount: 7, takenAt: '2026-10-12T21:00:00Z' },
          { stepsSinceBoot: 3000, bootCount: 7, takenAt: '2026-10-12T23:00:00Z' },
          { stepsSinceBoot: 3000, bootCount: 7, takenAt: '2026-10-15T06:00:00Z' },
          { stepsSinceBoot: 5000, bootCount: 7, takenAt: '2026-10-15T10:00:00Z' },
        ],
        timeZoneChanges: [{ timeZone: 'Europe/Paris', since: '2026-01-01T00:00:00Z' }],
      })
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  it('renvoie les jours enregistrés de la période, dans l’ordre chronologique', async () => {
    const response = await get(
      `/v1/devices/${deviceId}/daily-steps?from=2026-10-12&to=2026-10-15`,
    ).expect(200);

    expect(response.body).toEqual([
      { day: '2026-10-12', steps: 1000 },
      { day: '2026-10-13', steps: 1000 },
      { day: '2026-10-14', steps: 0 },
      { day: '2026-10-15', steps: 2000 },
    ]);
  });

  it('exclut les jours hors de la période (bornes incluses)', async () => {
    const response = await get(
      `/v1/devices/${deviceId}/daily-steps?from=2026-10-13&to=2026-10-13`,
    ).expect(200);

    expect(response.body).toEqual([{ day: '2026-10-13', steps: 1000 }]);
  });

  it('renvoie une liste vide pour une période sans données', async () => {
    await get(`/v1/devices/${deviceId}/daily-steps?from=2026-01-01&to=2026-01-31`).expect(200, []);
  });

  describe('erreurs', () => {
    it.each([
      ['sans période', ''],
      ['avec une date invalide', '?from=2026-02-30&to=2026-03-01'],
      ['avec une date mal formée', '?from=12/10/2026&to=2026-10-15'],
      ['avec un début après la fin', '?from=2026-10-15&to=2026-10-12'],
      ['avec une période de plus de 366 jours', '?from=2025-01-01&to=2026-12-31'],
    ])('400 %s', async (_case, query) => {
      await get(`/v1/devices/${deviceId}/daily-steps${query}`)
        .expect(400)
        .expect('Content-Type', /application\/problem\+json/);
    });

    it('404 pour un appareil inconnu', async () => {
      const response = await get(
        '/v1/devices/00000000-0000-4000-8000-000000000000/daily-steps?from=2026-10-12&to=2026-10-15',
      ).expect(404);

      expect(response.body).toMatchObject({
        detail: expect.stringContaining('Appareil inconnu') as string,
      });
    });
  });
});
