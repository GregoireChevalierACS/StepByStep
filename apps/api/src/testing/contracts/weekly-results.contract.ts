import { randomUUID } from 'node:crypto';
import { GroupName, IsoWeek, Nickname } from '@stepbystep/domain';
import { expect, it } from 'vitest';
import type { AccountRepository } from '../../accounts/account.repository.js';
import type { GroupRepository } from '../../groups/group.repository.js';
import type { RankedMember } from '../../groups/ranking.query.js';
import type {
  RankGroups,
  WeeklyResultsRepository,
} from '../../groups/weekly-results.repository.js';
import { unwrap } from '../unwrap.js';

export interface WeeklyResultsFixture {
  readonly repository: WeeklyResultsRepository;
  readonly groups: GroupRepository;
  readonly accounts: AccountRepository;
  readonly givenAccount: () => Promise<string>;
}

// Une semaine propre à chaque test : la base est partagée, et la clôture porte sur tous les
// groupes. Années lointaines, pour ne croiser aucune autre donnée.
const freshWeek = () =>
  unwrap(IsoWeek.create(`${String(3000 + Math.floor(Math.random() * 6000))}-W10`));
const plain = (ranking: readonly RankedMember[] | undefined) =>
  ranking?.map(({ rank, nickname, steps }) => [rank, nickname.value, steps]);
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Contrat du port WeeklyResultsRepository (voir deviceRepositoryContract). */
export const weeklyResultsContract = (fixture: () => WeeklyResultsFixture): void => {
  const member = async (f: WeeklyResultsFixture, nickname: string) => {
    const accountId = await f.givenAccount();
    await f.accounts.setNickname(accountId, unwrap(Nickname.create(nickname)));
    return { accountId, nickname: unwrap(Nickname.create(nickname)) };
  };
  // Un groupe et le classement que la clôture lui donnera (les autres groupes de la base,
  // absents du résultat, ne sont pas figés).
  const givenGroup = async (f: WeeklyResultsFixture, steps: readonly [string, number][]) => {
    const members = await Promise.all(steps.map(([nickname]) => member(f, nickname)));
    const [first, ...others] = members;
    const code = `code-${randomUUID()}`;
    const group = await f.groups.create(
      first?.accountId ?? '',
      unwrap(GroupName.create('Bureau')),
      code,
    );
    for (const { accountId } of others) unwrap(await f.groups.join(accountId, code, 50));
    const ranking = members.map((m, index) => ({
      ...m,
      steps: steps[index]?.[1] ?? 0,
      rank: index + 1,
    }));
    return { groupId: group.id, ranking, members };
  };
  const rankingOf =
    (groups: readonly { groupId: string; ranking: RankedMember[] }[]): RankGroups =>
    (ids) =>
      Promise.resolve(
        new Map(
          groups
            .filter(({ groupId }) => ids.includes(groupId))
            .map(({ groupId, ranking }) => [groupId, ranking]),
        ),
      );
  // Une autre clôture peut être en cours (autres tests) : on réessaie, comme le job.
  const close = async (f: WeeklyResultsFixture, week: IsoWeek, rank: RankGroups) => {
    for (;;) {
      const closed = await f.repository.closeWeek(week, rank);
      if (closed !== undefined) return closed;
      await delay(20);
    }
  };

  it('fige le classement d’une semaine, absent tant qu’elle n’est pas close', async () => {
    const f = fixture();
    const week = freshWeek();
    const group = await givenGroup(f, [
      ['Paul', 25_000],
      ['Zoé', 18_000],
    ]);
    expect(await f.repository.resultsOf(group.groupId, week)).toBeUndefined();

    expect(await close(f, week, rankingOf([group]))).toBeGreaterThanOrEqual(1);

    expect(plain(await f.repository.resultsOf(group.groupId, week))).toEqual([
      [1, 'Paul', 25_000],
      [2, 'Zoé', 18_000],
    ]);
  });

  it('ne fige une semaine qu’une fois : une seconde clôture ne la recalcule pas', async () => {
    const f = fixture();
    const week = freshWeek();
    const group = await givenGroup(f, [['Zoé', 10_000]]);
    await close(f, week, rankingOf([group]));
    const asked: string[] = [];
    const later: RankGroups = (ids) => {
      asked.push(...ids);
      return rankingOf([
        { ...group, ranking: group.ranking.map((m) => ({ ...m, steps: 99_999 })) },
      ])(ids);
    };

    await close(f, week, later);

    expect(asked).not.toContain(group.groupId);
    expect(plain(await f.repository.resultsOf(group.groupId, week))).toEqual([[1, 'Zoé', 10_000]]);
  });

  it('n’accepte qu’une clôture à la fois : la seconde passe son tour', async () => {
    const f = fixture();
    const week = freshWeek();
    const group = await givenGroup(f, [['Zoé', 10_000]]);
    let release: () => void = () => undefined;
    let entered: () => void = () => undefined;
    const inside = new Promise<void>((resolve) => (entered = resolve));
    const gate = new Promise<void>((resolve) => (release = resolve));
    const slow: RankGroups = async (ids) => {
      entered();
      await gate;
      return rankingOf([group])(ids);
    };

    const first = close(f, week, slow);
    await inside;
    const second = await f.repository.closeWeek(week, rankingOf([group]));
    release();

    expect(second).toBeUndefined();
    expect(await first).toBeGreaterThanOrEqual(1);
    expect(plain(await f.repository.resultsOf(group.groupId, week))).toEqual([[1, 'Zoé', 10_000]]);
  });

  it('ne fige rien si le classement échoue, et laisse la clôture suivante réussir', async () => {
    const f = fixture();
    const week = freshWeek();
    const group = await givenGroup(f, [['Zoé', 10_000]]);
    const failing: RankGroups = () => Promise.reject(new Error('classement indisponible'));

    // Réessayé tant qu'une autre clôture est en cours : on veut voir celle-ci échouer.
    let failure: unknown;
    while (failure === undefined) {
      failure = await f.repository.closeWeek(week, failing).then(
        async () => {
          await delay(20);
          return undefined;
        },
        (error: unknown) => error,
      );
    }
    expect(failure).toEqual(new Error('classement indisponible'));
    expect(await f.repository.resultsOf(group.groupId, week)).toBeUndefined();

    await close(f, week, rankingOf([group]));
    expect(plain(await f.repository.resultsOf(group.groupId, week))).toEqual([[1, 'Zoé', 10_000]]);
  });

  it('retire des classements figés un compte supprimé', async () => {
    const f = fixture();
    const week = freshWeek();
    const group = await givenGroup(f, [
      ['Paul', 25_000],
      ['Zoé', 18_000],
    ]);
    await close(f, week, rankingOf([group]));

    await f.accounts.delete(group.members[0]?.accountId ?? '');

    expect(plain(await f.repository.resultsOf(group.groupId, week))).toEqual([[2, 'Zoé', 18_000]]);
  });
};
