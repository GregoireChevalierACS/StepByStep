import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { FORBIDDEN_PROBLEM_TYPE, INVALID_CREDENTIALS_PROBLEM_TYPE } from '../auth/auth-errors.js';
import { configureApp } from '../configure-app.js';
import { DEVICE_NOT_FOUND_PROBLEM_TYPE } from '../devices/device-errors.js';
import {
  type AuthenticatedDevice,
  registerAuthenticatedDevice,
} from '../testing/authenticated-device.js';

type App = Parameters<typeof request>[0];

describe('DELETE /v1/accounts/:accountId', () => {
  let app: INestApplication<App>;
  const http = () => request(app.getHttpServer());

  const deleteAccount = (accountId: string, authorization: string) =>
    http().delete(`/v1/accounts/${accountId}`).set('Authorization', authorization);

  // Un appareil authentifié avec des données dans chaque table : objectif, fuseau, relevés,
  // pas par jour et événement GoalReached dans l'outbox (12 000 pas pour un objectif de 10 000).
  const deviceWithData = async (): Promise<AuthenticatedDevice> => {
    const device = await registerAuthenticatedDevice(app.getHttpServer());
    await http()
      .put(`/v1/accounts/${device.accountId}/goal`)
      .set('Authorization', device.authorization)
      .send({ goal: 10_000, effectiveFrom: '2026-10-01' })
      .expect(200);
    await http()
      .post(`/v1/devices/${device.deviceId}/readings`)
      .set('Authorization', device.authorization)
      .send({
        readings: [
          { stepsSinceBoot: 0, bootCount: 7, takenAt: '2026-10-12T06:00:00Z' },
          { stepsSinceBoot: 12_000, bootCount: 7, takenAt: '2026-10-12T18:00:00Z' },
        ],
        timeZoneChanges: [{ timeZone: 'Europe/Paris', since: '2026-01-01T00:00:00Z' }],
      })
      .expect(200);
    return device;
  };

  // Lignes de chaque table qui concernent ce compte et son appareil, comptées en SQL : rien ne
  // doit échapper à la suppression, pas même un événement de l'outbox qui citerait l'appareil.
  const rowsOf = async ({ accountId, deviceId }: AuthenticatedDevice) => {
    const count = async (sql: string, id: string) => {
      const [row]: [{ count: string }] = await app.get(DataSource).query(sql, [id]);
      return Number(row.count);
    };
    return {
      accounts: await count('SELECT count(*) FROM accounts WHERE id = $1', accountId),
      devices: await count('SELECT count(*) FROM devices WHERE account_id = $1', accountId),
      daily_goals: await count('SELECT count(*) FROM daily_goals WHERE account_id = $1', accountId),
      device_time_zones: await count(
        'SELECT count(*) FROM device_time_zones WHERE device_id = $1',
        deviceId,
      ),
      step_counter_readings: await count(
        'SELECT count(*) FROM step_counter_readings WHERE device_id = $1',
        deviceId,
      ),
      daily_steps: await count('SELECT count(*) FROM daily_steps WHERE device_id = $1', deviceId),
      outbox_events: await count(
        `SELECT count(*) FROM outbox_events
         WHERE device_id = $1 OR payload->>'deviceId' = $1::text`,
        deviceId,
      ),
    };
  };
  const ALL_ROWS = {
    accounts: 1,
    devices: 1,
    daily_goals: 1,
    device_time_zones: 1,
    step_counter_readings: 2,
    daily_steps: 1,
    outbox_events: 1,
  };
  const NO_ROWS = {
    accounts: 0,
    devices: 0,
    daily_goals: 0,
    device_time_zones: 0,
    step_counter_readings: 0,
    daily_steps: 0,
    outbox_events: 0,
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication<INestApplication<App>>());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('efface le compte et toutes ses données, sans réponse à lire (204)', async () => {
    const device = await deviceWithData();
    expect(await rowsOf(device)).toEqual(ALL_ROWS);

    const response = await deleteAccount(device.accountId, device.authorization).expect(204);

    expect(response.body).toEqual({});
    expect(await rowsOf(device)).toEqual(NO_ROWS);
  });

  it('n’efface rien des autres comptes', async () => {
    const deleted = await deviceWithData();
    const kept = await deviceWithData();

    await deleteAccount(deleted.accountId, deleted.authorization).expect(204);

    expect(await rowsOf(kept)).toEqual(ALL_ROWS);
  });

  it('est idempotent : la demande renvoyée répond encore 204', async () => {
    const device = await deviceWithData();
    await deleteAccount(device.accountId, device.authorization).expect(204);

    await deleteAccount(device.accountId, device.authorization).expect(204);
  });

  it('rend l’appareil inconnu : secret refusé, routes d’appareil en 404', async () => {
    const device = await deviceWithData();
    await deleteAccount(device.accountId, device.authorization).expect(204);

    const exchange = await http()
      .post(`/v1/devices/${device.deviceId}/tokens`)
      .send({ secret: device.secret })
      .expect(401);
    // Le jeton reste valide jusqu'à son expiration, mais l'appareil n'existe plus.
    const read = await http()
      .get(`/v1/devices/${device.deviceId}/daily-steps?from=2026-10-01&to=2026-10-31`)
      .set('Authorization', device.authorization)
      .expect(404);

    expect(exchange.body).toMatchObject({ type: INVALID_CREDENTIALS_PROBLEM_TYPE });
    expect(read.body).toMatchObject({ type: DEVICE_NOT_FOUND_PROBLEM_TYPE });
  });

  describe('erreurs', () => {
    it('403 avec le jeton d’un appareil d’un autre compte, sans rien effacer', async () => {
      const target = await deviceWithData();
      const other = await registerAuthenticatedDevice(app.getHttpServer());

      const response = await deleteAccount(target.accountId, other.authorization).expect(403);

      expect(response.body).toMatchObject({ type: FORBIDDEN_PROBLEM_TYPE });
      expect(await rowsOf(target)).toEqual(ALL_ROWS);
    });

    it('401 sans jeton', async () => {
      const target = await deviceWithData();

      await deleteAccount(target.accountId, '').expect(401);

      expect(await rowsOf(target)).toEqual(ALL_ROWS);
    });
  });
});
