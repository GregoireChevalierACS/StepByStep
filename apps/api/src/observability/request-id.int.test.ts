import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../app.module.js';
import { configureApp } from '../configure-app.js';
import { registerAuthenticatedDevice } from '../testing/authenticated-device.js';
import { AppLogger } from './app-logger.js';

type App = Parameters<typeof request>[0];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('identifiant de requête et journal d’accès', () => {
  let app: INestApplication<App>;
  let lines: string[];
  const http = () => request(app.getHttpServer());
  // Lignes JSON du journal d'accès (contexte HTTP).
  const accessLines = () =>
    lines
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .filter(({ context }) => context === 'HTTP');

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication<INestApplication<App>>());
    app.useLogger(new AppLogger('json'));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    lines = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      lines.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('donne un identifiant neuf à chaque requête, renvoyé dans X-Request-Id', async () => {
    const first = await http().get('/v1/health').expect(200);
    const second = await http().get('/v1/health').expect(200);

    expect(first.headers['x-request-id']).toMatch(UUID);
    expect(second.headers['x-request-id']).not.toBe(first.headers['x-request-id']);
  });

  it('reprend l’identifiant reçu s’il est bien formé, pour suivre la requête de bout en bout', async () => {
    const response = await http()
      .get('/v1/health')
      .set('X-Request-Id', 'proxy-abc.123')
      .expect(200);

    expect(response.headers['x-request-id']).toBe('proxy-abc.123');
  });

  it.each([
    ['trop long', 'x'.repeat(65)],
    ['avec des caractères qui pourraient fausser un journal', 'abc"} {"level":"error'],
  ])('remplace un identifiant reçu %s', async (_case, received) => {
    const response = await http().get('/v1/health').set('X-Request-Id', received).expect(200);

    expect(response.headers['x-request-id']).toMatch(UUID);
  });

  it('journalise chaque requête : modèle de route (jamais l’URL réelle), statut, durée, identifiant', async () => {
    const device = await registerAuthenticatedDevice(app.getHttpServer());
    lines = [];

    const response = await http()
      .get(`/v1/devices/${device.deviceId}/daily-steps?from=2026-10-01&to=2026-10-31`)
      .set('Authorization', device.authorization)
      .expect(200);

    const [access] = accessLines();
    expect(access).toMatchObject({
      level: 'log',
      message: 'Requête traitée',
      method: 'GET',
      route: '/v1/devices/:deviceId/daily-steps',
      status: 200,
      requestId: response.headers['x-request-id'],
    });
    expect(access?.['durationMs']).toEqual(expect.any(Number));
    expect(JSON.stringify(access)).not.toContain(device.deviceId);
  });

  it('journalise aussi une requête refusée par la garde, et une route inconnue sans modèle', async () => {
    await http().get('/v1/devices/00000000-0000-4000-8000-000000000000/streak').expect(401);
    await http().get('/v1/inconnue').expect(404);

    expect(accessLines().map(({ route, status }) => [route, status])).toEqual([
      ['/v1/devices/:deviceId/streak', 401],
      [null, 404],
    ]);
  });
});
