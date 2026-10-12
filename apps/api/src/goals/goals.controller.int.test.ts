import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { configureApp } from '../configure-app.js';

type App = Parameters<typeof request>[0];

describe('PUT /v1/accounts/:accountId/goal', () => {
  let app: INestApplication<App>;

  const newAccount = async (): Promise<string> =>
    (
      (await request(app.getHttpServer()).post('/v1/devices').expect(201)).body as {
        accountId: string;
      }
    ).accountId;
  const setGoal = (accountId: string, body: unknown) =>
    request(app.getHttpServer())
      .put(`/v1/accounts/${accountId}/goal`)
      .send(body as object);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication<INestApplication<App>>());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('fixe l’objectif et renvoie l’historique du compte', async () => {
    const response = await setGoal(await newAccount(), {
      goal: 10_000,
      effectiveFrom: '2026-10-01',
    }).expect(200);

    expect(response.body).toEqual([{ effectiveFrom: '2026-10-01', goal: 10_000 }]);
  });

  it('ajoute un changement sans réécrire le passé', async () => {
    const accountId = await newAccount();
    await setGoal(accountId, { goal: 10_000, effectiveFrom: '2026-10-01' }).expect(200);

    const response = await setGoal(accountId, { goal: 12_000, effectiveFrom: '2026-10-12' }).expect(
      200,
    );

    expect(response.body).toEqual([
      { effectiveFrom: '2026-10-01', goal: 10_000 },
      { effectiveFrom: '2026-10-12', goal: 12_000 },
    ]);
  });

  it('remplace l’objectif déjà fixé le même jour : la dernière décision l’emporte', async () => {
    const accountId = await newAccount();
    await setGoal(accountId, { goal: 10_000, effectiveFrom: '2026-10-01' }).expect(200);
    await setGoal(accountId, { goal: 12_000, effectiveFrom: '2026-10-12' }).expect(200);

    const response = await setGoal(accountId, { goal: 8_000, effectiveFrom: '2026-10-12' }).expect(
      200,
    );

    expect(response.body).toEqual([
      { effectiveFrom: '2026-10-01', goal: 10_000 },
      { effectiveFrom: '2026-10-12', goal: 8_000 },
    ]);
  });

  it('est idempotent : la même requête renvoyée donne le même état', async () => {
    const accountId = await newAccount();
    const first = await setGoal(accountId, { goal: 10_000, effectiveFrom: '2026-10-01' }).expect(
      200,
    );

    const second = await setGoal(accountId, { goal: 10_000, effectiveFrom: '2026-10-01' }).expect(
      200,
    );

    expect(second.body).toEqual(first.body);
  });

  describe('erreurs', () => {
    it.each([0, -5, 12.5])('422 pour un objectif refusé par le domaine : %s', async (goal) => {
      const response = await setGoal(await newAccount(), {
        goal,
        effectiveFrom: '2026-10-01',
      }).expect(422);

      expect(response.body).toMatchObject({
        status: 422,
        errors: [{ path: 'goal', message: 'InvalidDailyGoal' }],
      });
    });

    it.each([
      ['sans objectif', { effectiveFrom: '2026-10-01' }],
      ['avec une date impossible', { goal: 10_000, effectiveFrom: '2026-02-30' }],
      ['avec un objectif qui n’est pas un nombre', { goal: '10000', effectiveFrom: '2026-10-01' }],
    ])('400 pour un corps mal formé : %s', async (_case, body) => {
      await setGoal(await newAccount(), body).expect(400);
    });

    it('400 pour un identifiant de compte qui n’est pas un UUID', async () => {
      await setGoal('pas-un-uuid', { goal: 10_000, effectiveFrom: '2026-10-01' }).expect(400);
    });

    it('404 pour un compte inconnu', async () => {
      const response = await setGoal('00000000-0000-4000-8000-000000000000', {
        goal: 10_000,
        effectiveFrom: '2026-10-01',
      }).expect(404);

      expect(response.body).toMatchObject({
        detail: expect.stringContaining('Compte inconnu') as string,
      });
    });
  });
});
