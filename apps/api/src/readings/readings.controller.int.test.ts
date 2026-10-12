import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { configureApp } from '../configure-app.js';

type App = Parameters<typeof request>[0];

const PARIS = { timeZone: 'Europe/Paris', since: '2026-01-01T00:00:00.000Z' };
const batch = {
  readings: [
    { stepsSinceBoot: 1000, bootCount: 7, takenAt: '2026-10-12T06:00:00.000Z' },
    { stepsSinceBoot: 3000, bootCount: 7, takenAt: '2026-10-12T10:00:00.000Z' },
  ],
  timeZoneChanges: [PARIS],
};

describe('POST /v1/devices/:deviceId/readings', () => {
  let app: INestApplication<App>;

  const newDevice = async (): Promise<string> =>
    (
      (await request(app.getHttpServer()).post('/v1/devices').expect(201)).body as {
        deviceId: string;
      }
    ).deviceId;
  const send = (deviceId: string, body: unknown) =>
    request(app.getHttpServer())
      .post(`/v1/devices/${deviceId}/readings`)
      .send(body as object);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication<INestApplication<App>>());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('enregistre le lot et renvoie le compte rendu (acceptés, doublons, jours recalculés)', async () => {
    const response = await send(await newDevice(), batch).expect(200);

    expect(response.body).toEqual({
      accepted: 2,
      duplicates: 0,
      days: [{ day: '2026-10-12', steps: 2000 }],
    });
  });

  it('ignore un lot renvoyé à l’identique', async () => {
    const deviceId = await newDevice();
    await send(deviceId, batch).expect(200);

    const response = await send(deviceId, batch).expect(200);

    expect(response.body).toEqual({ accepted: 0, duplicates: 2, days: [] });
  });

  it('accepte des instants avec un décalage horaire explicite', async () => {
    const response = await send(await newDevice(), {
      readings: [
        { stepsSinceBoot: 1000, bootCount: 7, takenAt: '2026-10-12T08:00:00+02:00' },
        { stepsSinceBoot: 1500, bootCount: 7, takenAt: '2026-10-12T12:00:00+02:00' },
      ],
      timeZoneChanges: [PARIS],
    }).expect(200);

    expect(response.body).toMatchObject({ days: [{ day: '2026-10-12', steps: 500 }] });
  });

  describe('erreurs, au format Problem Details', () => {
    it.each([
      ['sans liste de relevés', { timeZoneChanges: [PARIS] }],
      [
        'avec un instant qui n’est pas en ISO 8601',
        { readings: [{ ...batch.readings[0], takenAt: '12/10/2026' }] },
      ],
      [
        'avec un nombre de pas qui n’est pas un nombre',
        { readings: [{ ...batch.readings[0], stepsSinceBoot: '42' }] },
      ],
      [
        'avec plus de 500 relevés',
        {
          readings: Array.from({ length: 501 }, () => batch.readings[0]),
          timeZoneChanges: [PARIS],
        },
      ],
    ])('400 pour un corps mal formé : %s', async (_case, body) => {
      const response = await send(await newDevice(), body)
        .expect(400)
        .expect('Content-Type', /application\/problem\+json/);

      expect(response.body).toMatchObject({ status: 400, errors: expect.any(Array) as unknown });
    });

    it('400 pour un identifiant d’appareil qui n’est pas un UUID', async () => {
      await send('pas-un-uuid', batch).expect(400);
    });

    it('404 pour un appareil inconnu', async () => {
      const response = await send('00000000-0000-4000-8000-000000000000', batch).expect(404);

      // Le message prouve que la route existe et que c'est bien l'appareil qui est inconnu.
      expect(response.body).toMatchObject({
        detail: expect.stringContaining('Appareil inconnu') as string,
      });
    });

    it('422 quand le domaine refuse une valeur, avec le chemin du relevé fautif', async () => {
      const response = await send(await newDevice(), {
        readings: [batch.readings[0], { ...batch.readings[1], stepsSinceBoot: -5 }],
        timeZoneChanges: [PARIS],
      }).expect(422);

      expect(response.body).toMatchObject({
        status: 422,
        errors: [{ path: 'readings.1', message: 'InvalidStepsSinceBoot' }],
      });
    });

    it('422 quand aucun fuseau horaire n’a jamais été transmis', async () => {
      await send(await newDevice(), { readings: batch.readings }).expect(422);
    });

    it('409 pour un fuseau contradictoire avec celui déjà enregistré', async () => {
      const deviceId = await newDevice();
      await send(deviceId, batch).expect(200);

      await send(deviceId, {
        readings: [],
        timeZoneChanges: [{ timeZone: 'Asia/Tokyo', since: PARIS.since }],
      }).expect(409);
    });
  });
});
