import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { configureApp } from '../configure-app.js';
import {
  dailyStepsResponse,
  deviceTokenResponse,
  goalHistoryResponse,
  problemDetailsResponse,
  recordReadingsResponse,
  registeredDeviceResponse,
  streakResponse,
} from './contract.js';

type App = Parameters<typeof request>[0];

// Test de contrat : chaque réponse RÉELLE doit respecter exactement le schéma publié en
// OpenAPI (objets stricts). Si le code change la forme d'une réponse sans le contrat, ce test échoue.
describe('contrat de l’API : les réponses réelles respectent les schémas publiés', () => {
  let app: INestApplication<App>;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication<INestApplication<App>>());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('suit le parcours complet d’un appareil', async () => {
    const device = registeredDeviceResponse.parse(
      (await http().post('/v1/devices').expect(201)).body,
    );
    const { token } = deviceTokenResponse.parse(
      (
        await http()
          .post(`/v1/devices/${device.deviceId}/tokens`)
          .send({ secret: device.secret })
          .expect(200)
      ).body,
    );
    const authorization = `Bearer ${token}`;

    recordReadingsResponse.parse(
      (
        await http()
          .post(`/v1/devices/${device.deviceId}/readings`)
          .set('Authorization', authorization)
          .send({
            readings: [
              { stepsSinceBoot: 0, bootCount: 7, takenAt: '2026-10-12T06:00:00Z' },
              { stepsSinceBoot: 12_000, bootCount: 7, takenAt: '2026-10-12T18:00:00Z' },
            ],
            timeZoneChanges: [{ timeZone: 'Europe/Paris', since: '2026-01-01T00:00:00Z' }],
          })
          .expect(200)
      ).body,
    );

    dailyStepsResponse.parse(
      (
        await http()
          .get(`/v1/devices/${device.deviceId}/daily-steps?from=2026-10-01&to=2026-10-31`)
          .set('Authorization', authorization)
          .expect(200)
      ).body,
    );

    goalHistoryResponse.parse(
      (
        await http()
          .put(`/v1/accounts/${device.accountId}/goal`)
          .set('Authorization', authorization)
          .send({ goal: 10_000, effectiveFrom: '2026-10-01' })
          .expect(200)
      ).body,
    );

    streakResponse.parse(
      (
        await http()
          .get(`/v1/devices/${device.deviceId}/streak`)
          .set('Authorization', authorization)
          .expect(200)
      ).body,
    );
  });

  it('renvoie ses erreurs au format Problem Details publié', async () => {
    const unauthenticated = await http()
      .get('/v1/devices/00000000-0000-4000-8000-000000000000/streak')
      .expect(401);
    const refusedSecret = await http()
      .post('/v1/devices/00000000-0000-4000-8000-000000000000/tokens')
      .send({ secret: 'pas-le-bon' })
      .expect(401);

    for (const { body } of [unauthenticated, refusedSecret]) {
      expect(problemDetailsResponse.safeParse(body).success).toBe(true);
    }
  });
});
