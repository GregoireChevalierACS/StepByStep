import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { FORBIDDEN_PROBLEM_TYPE } from '../auth/auth-errors.js';
import { closableWeek, LocalDate } from '@stepbystep/domain';
import { configureApp } from '../configure-app.js';
import { unwrap } from '../testing/unwrap.js';
import { ChallengeCloser } from './challenge-closer.js';
import {
  type AuthenticatedDevice,
  registerAuthenticatedDevice,
} from '../testing/authenticated-device.js';
import {
  GROUP_FULL_PROBLEM_TYPE,
  INVITE_CODE_UNKNOWN_PROBLEM_TYPE,
  NICKNAME_REQUIRED_PROBLEM_TYPE,
} from './group-errors.js';
import type { GroupView } from './groups.service.js';

type App = Parameters<typeof request>[0];

describe('groupes : /v1/accounts/:accountId/groups', () => {
  let app: INestApplication<App>;
  const http = () => request(app.getHttpServer());
  const groupsOf = (device: AuthenticatedDevice) => `/v1/accounts/${device.accountId}/groups`;

  // Un compte authentifié, avec un pseudo s'il en faut un.
  const member = async (nickname?: string): Promise<AuthenticatedDevice> => {
    const device = await registerAuthenticatedDevice(app.getHttpServer());
    if (nickname !== undefined) {
      await http()
        .put(`/v1/accounts/${device.accountId}/nickname`)
        .set('Authorization', device.authorization)
        .send({ nickname })
        .expect(200);
    }
    return device;
  };
  const create = (device: AuthenticatedDevice, name: string) =>
    http().post(groupsOf(device)).set('Authorization', device.authorization).send({ name });
  const created = async (device: AuthenticatedDevice, name: string): Promise<GroupView> =>
    (await create(device, name).expect(201)).body as GroupView;
  const join = (device: AuthenticatedDevice, inviteCode: string) =>
    http()
      .post(`${groupsOf(device)}/join`)
      .set('Authorization', device.authorization)
      .send({ inviteCode });
  const list = async (device: AuthenticatedDevice): Promise<GroupView[]> =>
    (await http().get(groupsOf(device)).set('Authorization', device.authorization).expect(200))
      .body as GroupView[];
  const groupCount = async (groupId: string): Promise<number> => {
    const [row]: [{ count: string }] = await app
      .get(DataSource)
      .query('SELECT count(*) FROM groups WHERE id = $1', [groupId]);
    return Number(row.count);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication<INestApplication<App>>());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('crée un groupe (201), que d’autres rejoignent par son code (200)', async () => {
    const zoe = await member('Zoé');
    const paul = await member('Paul');
    const group = await created(zoe, 'Bureau');

    const joined = (await join(paul, group.inviteCode).expect(200)).body as GroupView;

    expect(joined).toEqual({
      groupId: group.groupId,
      name: 'Bureau',
      inviteCode: group.inviteCode,
      members: [
        { nickname: 'Zoé', you: false },
        { nickname: 'Paul', you: true },
      ],
    });
    expect((await list(zoe)).map(({ groupId }) => groupId)).toEqual([group.groupId]);
  });

  it('rejoindre deux fois ne change rien (idempotent)', async () => {
    const paul = await member('Paul');
    const { inviteCode } = await created(await member('Zoé'), 'Bureau');
    await join(paul, inviteCode).expect(200);

    const again = (await join(paul, inviteCode).expect(200)).body as GroupView;

    expect(again.members).toHaveLength(2);
  });

  it('quitter retire le membre (204), et supprime le groupe avec son dernier membre', async () => {
    const zoe = await member('Zoé');
    const paul = await member('Paul');
    const { groupId, inviteCode } = await created(zoe, 'Bureau');
    await join(paul, inviteCode).expect(200);
    const leave = (device: AuthenticatedDevice) =>
      http()
        .delete(`${groupsOf(device)}/${groupId}`)
        .set('Authorization', device.authorization);

    await leave(zoe).expect(204);
    await leave(zoe).expect(204);
    expect(await list(zoe)).toEqual([]);
    expect(await groupCount(groupId)).toBe(1);

    await leave(paul).expect(204);
    expect(await groupCount(groupId)).toBe(0);
  });

  it('supprimer son compte supprime les groupes dont on était le dernier membre', async () => {
    const zoe = await member('Zoé');
    const { groupId } = await created(zoe, 'Solo');

    await http()
      .delete(`/v1/accounts/${zoe.accountId}`)
      .set('Authorization', zoe.authorization)
      .expect(204);

    expect(await groupCount(groupId)).toBe(0);
  });

  it('sert le classement de la semaine, maximum par jour entre les appareils', async () => {
    const zoe = await member('Zoé');
    const paul = await member('Paul');
    const { groupId, inviteCode } = await created(zoe, 'Bureau');
    await join(paul, inviteCode).expect(200);
    // Pas par jour écrits directement : deux appareils pour Paul, le même jour.
    const database = app.get(DataSource);
    const [watch]: [{ id: string }] = await database.query(
      'INSERT INTO devices (account_id) VALUES ($1) RETURNING id',
      [paul.accountId],
    );
    await database.query(
      `INSERT INTO daily_steps (device_id, day, steps) VALUES
         ($1, '2026-11-03', 9000), ($2, '2026-11-03', 7000), ($3, '2026-11-04', 4000)`,
      [paul.deviceId, watch.id, zoe.deviceId],
    );

    const response = await http()
      .get(`${groupsOf(zoe)}/${groupId}/ranking?week=2026-W45`)
      .set('Authorization', zoe.authorization)
      .expect(200);

    expect(response.body).toEqual({
      groupId,
      week: '2026-W45',
      from: '2026-11-02',
      to: '2026-11-08',
      closed: false,
      ranking: [
        { rank: 1, nickname: 'Paul', steps: 9000, you: false },
        { rank: 2, nickname: 'Zoé', steps: 4000, you: true },
      ],
    });
  });

  it('fige le classement à la clôture : les pas arrivés ensuite ne le changent plus', async () => {
    const zoe = await member('Zoé');
    const { groupId } = await created(zoe, 'Bureau');
    const database = app.get(DataSource);
    const closer = app.get(ChallengeCloser);
    // La semaine close dépend de la date du jour : celle que la règle du domaine désigne. Une
    // autre clôture peut tourner (autres tests) : on réessaie, comme le ferait le job.
    const closing = async () => {
      for (;;) {
        const result = await closer.closeDueWeek();
        if (result.closed !== undefined) return result.week;
      }
    };
    const today = unwrap(LocalDate.create(new Date().toISOString().slice(0, 10)));
    const week = closableWeek(today);
    await database.query('INSERT INTO daily_steps (device_id, day, steps) VALUES ($1, $2, 5000)', [
      zoe.deviceId,
      week.start.toString(),
    ]);
    const ranking = async () =>
      (
        await http()
          .get(`${groupsOf(zoe)}/${groupId}/ranking?week=${week.toString()}`)
          .set('Authorization', zoe.authorization)
          .expect(200)
      ).body as { closed: boolean; ranking: { steps: number }[] };
    expect(await ranking()).toMatchObject({ closed: false, ranking: [{ steps: 5000 }] });

    await closing();
    await database.query('UPDATE daily_steps SET steps = 9000 WHERE device_id = $1', [
      zoe.deviceId,
    ]);

    expect(await ranking()).toMatchObject({ closed: true, ranking: [{ steps: 5000 }] });
  });

  describe('erreurs', () => {
    it('classement : 404 hors du groupe, 400 semaine mal écrite, 422 semaine inexistante', async () => {
      const zoe = await member('Zoé');
      const { groupId } = await created(zoe, 'Bureau');
      const outsider = await member('Paul');
      const ranking = (device: AuthenticatedDevice, week: string) =>
        http()
          .get(`${groupsOf(device)}/${groupId}/ranking?week=${week}`)
          .set('Authorization', device.authorization);

      await ranking(outsider, '2026-W45').expect(404);
      await ranking(zoe, '2026-45').expect(400);
      const invalid = await ranking(zoe, '2025-W53').expect(422);

      expect(invalid.body).toMatchObject({ errors: [{ path: 'week', message: 'InvalidIsoWeek' }] });
    });

    it('409 nickname-required pour créer ou rejoindre sans pseudo', async () => {
      const anonymous = await member();
      const { inviteCode } = await created(await member('Zoé'), 'Bureau');

      const creation = await create(anonymous, 'Bureau').expect(409);
      const joining = await join(anonymous, inviteCode).expect(409);

      expect(creation.body).toMatchObject({ type: NICKNAME_REQUIRED_PROBLEM_TYPE });
      expect(joining.body).toMatchObject({ type: NICKNAME_REQUIRED_PROBLEM_TYPE });
    });

    it('404 invite-code-unknown pour un code bien formé qui ne mène à aucun groupe', async () => {
      const response = await join(await member('Zoé'), 'AAAAAAAAAAAAAAAAAAAAAA').expect(404);

      expect(response.body).toMatchObject({ type: INVITE_CODE_UNKNOWN_PROBLEM_TYPE });
    });

    it('409 group-full quand le groupe a atteint sa taille maximale', async () => {
      const { groupId, inviteCode } = await created(await member('Zoé'), 'Bureau');
      // 49 membres de plus, écrits directement : 50 au total, la limite.
      await app.get(DataSource).query(
        `WITH added AS (
           INSERT INTO accounts (nickname) SELECT 'Membre ' || n FROM generate_series(1, 49) n
           RETURNING id)
         INSERT INTO group_members (group_id, account_id) SELECT $1, id FROM added`,
        [groupId],
      );

      const response = await join(await member('En trop'), inviteCode).expect(409);

      expect(response.body).toMatchObject({ type: GROUP_FULL_PROBLEM_TYPE });
    });

    it.each([
      ['un code mal formé', { inviteCode: 'trop-court' }],
      ['sans code', {}],
    ])('400 pour rejoindre avec %s', async (_case, body) => {
      const zoe = await member('Zoé');

      await http()
        .post(`${groupsOf(zoe)}/join`)
        .set('Authorization', zoe.authorization)
        .send(body)
        .expect(400);
    });

    it('422 pour un nom de groupe refusé par le domaine', async () => {
      const response = await create(await member('Zoé'), '<b>').expect(422);

      expect(response.body).toMatchObject({
        errors: [{ path: 'name', message: 'InvalidGroupName:Characters' }],
      });
    });

    it('403 pour les groupes d’un autre compte, 401 sans jeton', async () => {
      const zoe = await member('Zoé');
      const paul = await member('Paul');

      const forbidden = await http()
        .get(groupsOf(zoe))
        .set('Authorization', paul.authorization)
        .expect(403);
      await http().get(groupsOf(zoe)).expect(401);

      expect(forbidden.body).toMatchObject({ type: FORBIDDEN_PROBLEM_TYPE });
    });
  });
});
