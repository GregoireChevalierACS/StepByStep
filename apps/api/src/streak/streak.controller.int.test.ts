import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { CLOCK } from '../clock/clock.js';
import { configureApp } from '../configure-app.js';
import { DeviceEntity } from '../database/entities/device.entity.js';
import { registerAuthenticatedDevice } from '../testing/authenticated-device.js';

type App = Parameters<typeof request>[0];

// Horloge fixe, réglée par chaque test : « maintenant » devient une donnée du test.
let now = Date.parse('2026-10-15T12:00:00Z');

describe('GET /v1/devices/:deviceId/streak', () => {
  let app: INestApplication<App>;

  const http = () => request(app.getHttpServer());
  // Jeton de chaque appareil et de son compte, pour appeler les routes protégées.
  const authorizations = new Map<string, string>();

  /** Crée un appareil (fuseau Paris) et enregistre `stepsPerDay` à partir du jour `firstDay`. */
  const deviceWalking = async (
    firstDay: number,
    stepsPerDay: readonly number[],
    goal?: { goal: number; effectiveFrom: string },
  ): Promise<{ deviceId: string; accountId: string }> => {
    const ids = await registerAuthenticatedDevice(app.getHttpServer());
    authorizations.set(ids.deviceId, ids.authorization);
    authorizations.set(ids.accountId, ids.authorization);
    if (goal) {
      await http()
        .put(`/v1/accounts/${ids.accountId}/goal`)
        .set('Authorization', ids.authorization)
        .send(goal)
        .expect(200);
    }
    // Deux relevés par jour (08:00 et 20:00 à Paris) ; aucun pas pendant la nuit.
    let counter = 0;
    const readings = stepsPerDay.flatMap((steps, index) => {
      const day = String(firstDay + index).padStart(2, '0');
      const morning = {
        stepsSinceBoot: counter,
        bootCount: 7,
        takenAt: `2026-10-${day}T06:00:00Z`,
      };
      counter += steps;
      return [
        morning,
        { stepsSinceBoot: counter, bootCount: 7, takenAt: `2026-10-${day}T18:00:00Z` },
      ];
    });
    await http()
      .post(`/v1/devices/${ids.deviceId}/readings`)
      .set('Authorization', ids.authorization)
      .send({
        readings,
        timeZoneChanges: [{ timeZone: 'Europe/Paris', since: '2026-01-01T00:00:00Z' }],
      })
      .expect(200);
    return { deviceId: ids.deviceId, accountId: ids.accountId };
  };

  const streakOf = async (deviceId: string) =>
    (
      await http()
        .get(`/v1/devices/${deviceId}/streak`)
        .set('Authorization', authorizations.get(deviceId) ?? '')
        .expect(200)
    ).body as {
      today: string;
      streak: number;
      badges: { id: string }[];
    };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK)
      .useValue({ now: () => now })
      .compile();
    app = configureApp(moduleRef.createNestApplication<INestApplication<App>>());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('compte les jours consécutifs, la journée en cours ne cassant pas la série', async () => {
    now = Date.parse('2026-10-15T12:00:00Z');
    const { deviceId } = await deviceWalking(12, [12_000, 12_000, 12_000, 3_000], {
      goal: 10_000,
      effectiveFrom: '2026-10-01',
    });

    expect(await streakOf(deviceId)).toEqual({ today: '2026-10-15', streak: 3, badges: [] });
  });

  it('juge chaque jour avec l’objectif en vigueur ce jour-là', async () => {
    now = Date.parse('2026-10-15T12:00:00Z');
    const { deviceId, accountId } = await deviceWalking(12, [12_000, 12_000, 12_000, 3_000], {
      goal: 10_000,
      effectiveFrom: '2026-10-01',
    });
    // Objectif relevé à 20 000 à partir d'aujourd'hui (le 15) : les jours passés restent jugés
    // avec 10 000 et la série tient. Juger le passé avec l'objectif actuel la ferait tomber à 0.
    await http()
      .put(`/v1/accounts/${accountId}/goal`)
      .set('Authorization', authorizations.get(accountId) ?? '')
      .send({ goal: 20_000, effectiveFrom: '2026-10-15' })
      .expect(200);

    expect((await streakOf(deviceId)).streak).toBe(3);
  });

  it('débloque « Semaine parfaite » après 7 jours de série', async () => {
    now = Date.parse('2026-10-15T20:00:00Z');
    const { deviceId } = await deviceWalking(
      9,
      Array.from({ length: 7 }, () => 12_000),
      {
        goal: 10_000,
        effectiveFrom: '2026-10-01',
      },
    );

    const result = await streakOf(deviceId);

    expect(result.streak).toBe(7);
    expect(result.badges).toEqual([
      expect.objectContaining({ id: 'perfect-week', label: 'Semaine parfaite' }) as unknown,
    ]);
  });

  it('calcule « aujourd’hui » dans le fuseau de l’appareil', async () => {
    // 22:30 UTC = 00:30 le 16 à Paris : le 15 est donc « hier ».
    now = Date.parse('2026-10-15T22:30:00Z');
    const { deviceId } = await deviceWalking(12, [12_000, 12_000, 12_000, 12_000], {
      goal: 10_000,
      effectiveFrom: '2026-10-01',
    });

    expect(await streakOf(deviceId)).toMatchObject({ today: '2026-10-16', streak: 4 });
  });

  it('applique l’objectif par défaut de 10 000 pas quand aucun n’a été fixé', async () => {
    now = Date.parse('2026-10-15T12:00:00Z');
    const { deviceId } = await deviceWalking(13, [10_500, 9_900, 2_000]);

    expect((await streakOf(deviceId)).streak).toBe(0);
    const { deviceId: other } = await deviceWalking(13, [9_900, 10_500, 2_000]);
    expect((await streakOf(other)).streak).toBe(1);
  });

  describe('erreurs', () => {
    it('404 pour un appareil supprimé dont le jeton est encore valide', async () => {
      const deleted = await registerAuthenticatedDevice(app.getHttpServer());
      await app.get(DataSource).getRepository(DeviceEntity).delete({ id: deleted.deviceId });

      const response = await http()
        .get(`/v1/devices/${deleted.deviceId}/streak`)
        .set('Authorization', deleted.authorization)
        .expect(404);

      expect(response.body).toMatchObject({
        detail: expect.stringContaining('Appareil inconnu') as string,
      });
    });

    it('401 sans jeton', async () => {
      const { deviceId } = await registerAuthenticatedDevice(app.getHttpServer());

      await http().get(`/v1/devices/${deviceId}/streak`).expect(401);
    });

    it('422 pour un appareil qui n’a encore transmis aucun fuseau', async () => {
      const { deviceId, authorization } = await registerAuthenticatedDevice(app.getHttpServer());

      await http()
        .get(`/v1/devices/${deviceId}/streak`)
        .set('Authorization', authorization)
        .expect(422);
    });
  });
});
