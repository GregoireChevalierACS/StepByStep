import { randomUUID } from 'node:crypto';
import { Nickname } from '@stepbystep/domain';
import { describe, expect, it } from 'vitest';
import { ANY_SECRET_HASH } from '../testing/fixtures.js';
import { InMemoryAccountRepository } from '../testing/in-memory-account.repository.js';
import { inMemoryStores } from '../testing/in-memory-stores.js';
import { unwrap } from '../testing/unwrap.js';
import { GroupsService, MAX_GROUP_MEMBERS } from './groups.service.js';

const setup = () => {
  const stores = inMemoryStores();
  const accounts = new InMemoryAccountRepository(stores);
  const service = new GroupsService(accounts, stores.groups);
  const account = async (nickname?: string) => {
    const { accountId } = await stores.devices.registerWithNewAccount(ANY_SECRET_HASH);
    if (nickname !== undefined) {
      await accounts.setNickname(accountId, unwrap(Nickname.create(nickname)));
    }
    return accountId;
  };
  return { service, account };
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
