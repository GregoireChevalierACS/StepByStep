import { randomUUID } from 'node:crypto';
import { Nickname } from '@stepbystep/domain';
import { describe, expect, it } from 'vitest';
import { ANY_SECRET_HASH } from '../testing/fixtures.js';
import { InMemoryAccountRepository } from '../testing/in-memory-account.repository.js';
import { InMemoryRankingQuery } from '../testing/in-memory-ranking.query.js';
import { inMemoryStores } from '../testing/in-memory-stores.js';
import { dailyStepsOf } from '../testing/contracts/ranking-query.contract.js';
import { unwrap } from '../testing/unwrap.js';
import { GroupsService, MAX_GROUP_MEMBERS } from './groups.service.js';

const setup = () => {
  const stores = inMemoryStores();
  const accounts = new InMemoryAccountRepository(stores);
  const service = new GroupsService(accounts, stores.groups, new InMemoryRankingQuery(stores));
  const account = async (nickname?: string) => {
    const { accountId } = await stores.devices.registerWithNewAccount(ANY_SECRET_HASH);
    if (nickname !== undefined) {
      await accounts.setNickname(accountId, unwrap(Nickname.create(nickname)));
    }
    return accountId;
  };
  return { service, account, stores };
};

describe('GroupsService', () => {
  it('crée un groupe avec un code d’invitation imprévisible, au format attendu', async () => {
    const { service, account } = setup();
    const zoe = await account('Zoé');

    const first = unwrap(await service.create(zoe, '  Bureau '));
    const second = unwrap(await service.create(zoe, 'Bureau'));

    expect(first).toMatchObject({ name: 'Bureau', members: [{ nickname: 'Zoé', you: true }] });
    expect(first.inviteCode).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(second.inviteCode).not.toBe(first.inviteCode);
  });

  it('montre à chaque membre les pseudos, et lequel est le sien', async () => {
    const { service, account } = setup();
    const zoe = await account('Zoé');
    const paul = await account('Paul');
    const { inviteCode } = unwrap(await service.create(zoe, 'Bureau'));

    const seenByPaul = unwrap(await service.join(paul, inviteCode));

    expect(seenByPaul.members).toEqual([
      { nickname: 'Zoé', you: false },
      { nickname: 'Paul', you: true },
    ]);
    expect((await service.list(zoe))[0]?.members).toEqual([
      { nickname: 'Zoé', you: true },
      { nickname: 'Paul', you: false },
    ]);
  });

  it('exige un pseudo pour créer ou rejoindre un groupe', async () => {
    const { service, account } = setup();
    const anonymous = await account();
    const { inviteCode } = unwrap(await service.create(await account('Zoé'), 'Bureau'));

    expect(await service.create(anonymous, 'Bureau')).toEqual({
      ok: false,
      error: { kind: 'NicknameRequired' },
    });
    expect(await service.join(anonymous, inviteCode)).toEqual({
      ok: false,
      error: { kind: 'NicknameRequired' },
    });
  });

  it('refuse un nom de groupe invalide, et signale un compte inconnu', async () => {
    const { service, account } = setup();
    const unknown = randomUUID();

    expect(await service.create(await account('Zoé'), 'ab')).toMatchObject({
      ok: false,
      error: { kind: 'InvalidGroupName', reason: 'Length' },
    });
    expect(await service.create(unknown, 'Bureau')).toEqual({
      ok: false,
      error: { kind: 'AccountNotFound', accountId: unknown },
    });
  });

  describe('classement', () => {
    it('classe les membres du groupe sur la semaine, et marque le compte qui demande', async () => {
      const { service, account, stores } = setup();
      const zoe = await account('Zoé');
      const paul = await account('Paul');
      const { groupId, inviteCode } = unwrap(await service.create(zoe, 'Bureau'));
      unwrap(await service.join(paul, inviteCode));
      const [paulPhone] = stores.devices.devicesOf(paul);
      stores.dailySteps.given(paulPhone ?? '', dailyStepsOf([['2026-11-03', 12_000]]));

      expect(unwrap(await service.ranking(zoe, groupId, '2026-W45'))).toEqual({
        groupId,
        week: '2026-W45',
        from: '2026-11-02',
        to: '2026-11-08',
        ranking: [
          { rank: 1, nickname: 'Paul', steps: 12_000, you: false },
          { rank: 2, nickname: 'Zoé', steps: 0, you: true },
        ],
      });
    });

    it('ne montre pas le classement d’un groupe dont le compte n’est pas membre', async () => {
      const { service, account } = setup();
      const { groupId } = unwrap(await service.create(await account('Zoé'), 'Bureau'));

      expect(await service.ranking(await account('Paul'), groupId, '2026-W45')).toEqual({
        ok: false,
        error: { kind: 'GroupNotFound', groupId },
      });
    });

    it('refuse une semaine qui n’existe pas', async () => {
      const { service, account } = setup();
      const zoe = await account('Zoé');
      const { groupId } = unwrap(await service.create(zoe, 'Bureau'));

      expect(await service.ranking(zoe, groupId, '2025-W53')).toEqual({
        ok: false,
        error: { kind: 'InvalidIsoWeek', value: '2025-W53' },
      });
    });
  });

  it(`limite un groupe à ${String(MAX_GROUP_MEMBERS)} membres`, async () => {
    const { service, account } = setup();
    const { inviteCode } = unwrap(await service.create(await account('Zoé'), 'Bureau'));
    for (let i = 1; i < MAX_GROUP_MEMBERS; i++) {
      unwrap(await service.join(await account(`Membre ${String(i)}`), inviteCode));
    }

    expect(await service.join(await account('En trop'), inviteCode)).toEqual({
      ok: false,
      error: { kind: 'GroupFull', maxMembers: MAX_GROUP_MEMBERS },
    });
  });
});
