import { randomUUID } from 'node:crypto';
import { GroupName, Nickname } from '@stepbystep/domain';
import { expect, it } from 'vitest';
import type { AccountRepository } from '../../accounts/account.repository.js';
import type { Group, GroupRepository } from '../../groups/group.repository.js';
import { unwrap } from '../unwrap.js';

export interface GroupRepositoryFixture {
  readonly repository: GroupRepository;
  /** Comptes de la même base : pseudos des membres, et suppression d'un compte. */
  readonly accounts: AccountRepository;
  readonly givenAccount: () => Promise<string>;
}

const name = (value: string) => unwrap(GroupName.create(value));
const newCode = () => `code-${randomUUID()}`;
// Ce que voit un client : nom, code et membres (pseudo), sans les objets du domaine.
const view = ({ name: groupName, inviteCode, members }: Group) => ({
  name: groupName.value,
  inviteCode,
  members: members.map(({ accountId, nickname }) => ({ accountId, nickname: nickname.value })),
});

/** Le seul groupe d'une liste : le test échoue clairement s'il y en a zéro ou plusieurs. */
const single = (groups: readonly Group[]): Group => {
  expect(groups).toHaveLength(1);
  const [group] = groups;
  if (group === undefined) throw new Error('Aucun groupe');
  return group;
};

/** Contrat du port GroupRepository (voir deviceRepositoryContract). */
export const groupRepositoryContract = (fixture: () => GroupRepositoryFixture): void => {
  // Un compte avec un pseudo : condition pour être membre d'un groupe.
  const givenMember = async (f: GroupRepositoryFixture, nickname: string): Promise<string> => {
    const accountId = await f.givenAccount();
    await f.accounts.setNickname(accountId, unwrap(Nickname.create(nickname)));
    return accountId;
  };

  it('crée un groupe dont le créateur est le premier membre', async () => {
    const f = fixture();
    const zoe = await givenMember(f, 'Zoé');
    const code = newCode();

    const group = await f.repository.create(zoe, name('Bureau'), code);

    expect(view(group)).toEqual({
      name: 'Bureau',
      inviteCode: code,
      members: [{ accountId: zoe, nickname: 'Zoé' }],
    });
    expect((await f.repository.groupsOf(zoe)).map(({ id }) => id)).toEqual([group.id]);
  });

  it('ajoute un membre par le code, dans l’ordre d’arrivée, et sans doublon', async () => {
    const f = fixture();
    const zoe = await givenMember(f, 'Zoé');
    const paul = await givenMember(f, 'Paul');
    const code = newCode();
    await f.repository.create(zoe, name('Bureau'), code);

    unwrap(await f.repository.join(paul, code, 50));
    const again = unwrap(await f.repository.join(paul, code, 50));

    expect(view(again).members).toEqual([
      { accountId: zoe, nickname: 'Zoé' },
      { accountId: paul, nickname: 'Paul' },
    ]);
  });

  it('refuse un code inconnu', async () => {
    const f = fixture();

    expect(await f.repository.join(await givenMember(f, 'Zoé'), newCode(), 50)).toEqual({
      ok: false,
      error: { kind: 'InviteCodeUnknown' },
    });
  });

  it('refuse un nouveau membre dans un groupe plein, mais pas un membre déjà là', async () => {
    const f = fixture();
    const zoe = await givenMember(f, 'Zoé');
    const paul = await givenMember(f, 'Paul');
    const code = newCode();
    await f.repository.create(zoe, name('Bureau'), code);
    unwrap(await f.repository.join(paul, code, 2));

    const late = await f.repository.join(await givenMember(f, 'Léa'), code, 2);

    expect(late).toEqual({ ok: false, error: { kind: 'GroupFull', maxMembers: 2 } });
    expect((await f.repository.join(paul, code, 2)).ok).toBe(true);
  });

  it('ne dépasse pas la taille maximale avec des arrivées simultanées', async () => {
    const f = fixture();
    const code = newCode();
    await f.repository.create(await givenMember(f, 'Zoé'), name('Bureau'), code);
    const candidates = await Promise.all(
      ['Ana', 'Ben', 'Cléo', 'Dan', 'Ève'].map((nickname) => givenMember(f, nickname)),
    );

    const results = await Promise.all(candidates.map((id) => f.repository.join(id, code, 3)));

    expect(results.filter(({ ok }) => ok)).toHaveLength(2);
    const [group] = await f.repository.groupsOf(candidates.find((_, i) => results[i]?.ok) ?? '');
    expect(group?.members).toHaveLength(3);
  });

  it('retire un membre qui part, et supprime le groupe avec son dernier membre', async () => {
    const f = fixture();
    const zoe = await givenMember(f, 'Zoé');
    const paul = await givenMember(f, 'Paul');
    const code = newCode();
    const group = await f.repository.create(zoe, name('Bureau'), code);
    unwrap(await f.repository.join(paul, code, 50));

    await f.repository.leave(zoe, group.id);
    expect((await f.repository.groupsOf(zoe)).map(({ id }) => id)).toEqual([]);
    expect(view(single(await f.repository.groupsOf(paul))).members).toEqual([
      { accountId: paul, nickname: 'Paul' },
    ]);

    await f.repository.leave(paul, group.id);
    // Le groupe n'existe plus : son code ne mène plus nulle part.
    expect((await f.repository.join(zoe, code, 50)).ok).toBe(false);
  });

  it('est sans effet pour un départ d’un groupe dont on n’est pas membre, ou inconnu', async () => {
    const f = fixture();
    const zoe = await givenMember(f, 'Zoé');
    const group = await f.repository.create(zoe, name('Bureau'), newCode());

    await f.repository.leave(await givenMember(f, 'Paul'), group.id);
    await f.repository.leave(zoe, randomUUID());

    expect(view(single(await f.repository.groupsOf(zoe))).members).toHaveLength(1);
  });

  it('suit la suppression d’un compte : ses groupes perdent le membre, ou disparaissent', async () => {
    const f = fixture();
    const zoe = await givenMember(f, 'Zoé');
    const paul = await givenMember(f, 'Paul');
    const shared = newCode();
    const alone = newCode();
    await f.repository.create(zoe, name('Bureau'), shared);
    unwrap(await f.repository.join(paul, shared, 50));
    await f.repository.create(zoe, name('Solo'), alone);

    await f.accounts.delete(zoe);

    expect(view(single(await f.repository.groupsOf(paul))).members).toEqual([
      { accountId: paul, nickname: 'Paul' },
    ]);
    expect(await f.repository.join(paul, alone, 50)).toEqual({
      ok: false,
      error: { kind: 'InviteCodeUnknown' },
    });
  });
};
