import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { UNAUTHENTICATED_PROBLEM_TYPE } from '../auth/auth-errors.js';
import { configureApp } from '../configure-app.js';
import { registerAuthenticatedDevice } from '../testing/authenticated-device.js';
import { METRICS_OPTIONS, type MetricsOptions } from './metrics.controller.js';

type App = Parameters<typeof request>[0];

const TOKEN = 'jeton-de-supervision-reserve-aux-tests';

const startApp = async (options?: MetricsOptions) => {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (options) builder = builder.overrideProvider(METRICS_OPTIONS).useValue(options);
  const app = configureApp(
    (await builder.compile()).createNestApplication<INestApplication<App>>(),
  );
  await app.init();
  return app;
};

describe('métriques Prometheus', () => {
  describe('sans jeton configuré', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      app = await startApp();
    });

    afterAll(async () => {
      await app.close();
    });

    it('n’expose rien : /metrics répond comme une route qui n’existe pas', async () => {
      const metrics = await request(app.getHttpServer()).get('/metrics').expect(404);
      const unknown = await request(app.getHttpServer()).get('/inconnue').expect(404);

      // Même problème qu'une route inconnue : seuls le détail et l'instance citent l'URL.
      const problem = ({ body }: { body: unknown }) => {
        const { type, title, status } = body as Record<string, unknown>;
        return { type, title, status };
      };
      expect(problem(metrics)).toEqual(problem(unknown));
      expect(metrics.body).toMatchObject({ detail: 'Cannot GET /metrics' });
    });
  });

  describe('avec un jeton configuré', () => {
    let app: INestApplication<App>;
    const http = () => request(app.getHttpServer());
    const scrape = async () =>
      (await http().get('/metrics').set('Authorization', `Bearer ${TOKEN}`).expect(200)).text;

    beforeAll(async () => {
      app = await startApp({ token: TOKEN });
    });

    afterAll(async () => {
      await app.close();
    });

    it.each([
      ['sans en-tête', undefined],
      ['avec un autre jeton', `Bearer ${TOKEN}-faux`],
      ['avec un schéma autre que Bearer', `Basic ${TOKEN}`],
    ])('refuse la lecture %s (401, WWW-Authenticate)', async (_case, authorization) => {
      const call = http().get('/metrics');
      if (authorization !== undefined) void call.set('Authorization', authorization);

      const response = await call.expect(401).expect('WWW-Authenticate', 'Bearer');

      expect(response.body).toMatchObject({ type: UNAUTHENTICATED_PROBLEM_TYPE, status: 401 });
    });

    it('expose au format Prometheus les métriques du processus', async () => {
      const response = await http()
        .get('/metrics')
        .set('Authorization', `Bearer ${TOKEN}`)
        .expect(200)
        .expect('Content-Type', /^text\/plain; version=0\.0\.4/);

      expect(response.text).toContain('process_cpu_user_seconds_total');
      expect(response.text).toContain('nodejs_eventloop_lag_seconds');
      expect(response.text).toContain('stepbystep_outbox_relay_failures_total 0');
    });

    it('mesure la latence par modèle de route, jamais par URL réelle', async () => {
      const device = await registerAuthenticatedDevice(app.getHttpServer());
      await http()
        .get(`/v1/devices/${device.deviceId}/daily-steps?from=2026-10-01&to=2026-10-31`)
        .set('Authorization', device.authorization)
        .expect(200);
      await http().get(`/v1/devices/${device.deviceId}/streak`).expect(401);
      await http().get(`/v1/devices/${device.deviceId}/inconnue`).expect(404);

      const metrics = await scrape();

      expect(metrics).toContain(
        'stepbystep_http_request_duration_seconds_count{method="GET",route="/v1/devices/:deviceId/daily-steps",status="200"} 1',
      );
      expect(metrics).toContain(
        'stepbystep_http_request_duration_seconds_count{method="GET",route="/v1/devices/:deviceId/streak",status="401"} 1',
      );
      // Une URL qu'aucune route ne sert : une seule série, quelle que soit l'URL.
      expect(metrics).toMatch(
        /stepbystep_http_request_duration_seconds_count\{method="GET",route="unmatched",status="404"\} \d+/,
      );
      expect(metrics).not.toContain(device.deviceId);
    });
  });
});
