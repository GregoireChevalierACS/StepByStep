import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { configureApp } from '../configure-app.js';
import { DeviceEntity } from '../database/entities/device.entity.js';

type App = Parameters<typeof request>[0];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('POST /v1/devices', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication<INestApplication<App>>());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('crée un compte et son appareil, et renvoie leurs identifiants', async () => {
    const response = await request(app.getHttpServer()).post('/v1/devices').expect(201);
    const body = response.body as { accountId: string; deviceId: string };

    expect(body.accountId).toMatch(UUID);
    expect(body.deviceId).toMatch(UUID);
    const device = await app
      .get(DataSource)
      .getRepository(DeviceEntity)
      .findOneByOrFail({ id: body.deviceId });
    expect(device.accountId).toBe(body.accountId);
  });

  it('crée un nouvel appareil à chaque appel', async () => {
    const first = await request(app.getHttpServer()).post('/v1/devices').expect(201);
    const second = await request(app.getHttpServer()).post('/v1/devices').expect(201);

    expect((first.body as { deviceId: string }).deviceId).not.toBe(
      (second.body as { deviceId: string }).deviceId,
    );
  });
});

describe('format des erreurs (RFC 9457, Problem Details)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication<INestApplication<App>>());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('renvoie une route inconnue au format application/problem+json', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/route-inconnue')
      .expect(404)
      .expect('Content-Type', /application\/problem\+json/);

    expect(response.body).toMatchObject({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      instance: '/v1/route-inconnue',
    });
  });
});
