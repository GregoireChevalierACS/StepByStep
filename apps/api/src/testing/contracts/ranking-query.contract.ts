import { randomUUID } from 'node:crypto';
import { GroupName, IsoWeek, LocalDate, Nickname, StepCount } from '@stepbystep/domain';
import { expect, it } from 'vitest';
import type { AccountRepository } from '../../accounts/account.repository.js';
import type { GroupRepository } from '../../groups/group.repository.js';
import type { RankedMember, RankingQuery } from '../../groups/ranking.query.js';
import { unwrap } from '../unwrap.js';

/** Adapters d'une même base : groupes, comptes et pas préparés, classement vérifié. */
export interface RankingQueryFixture {
  readonly query: RankingQuery;
  readonly groups: GroupRepository;
  readonly accounts: AccountRepository;
  /** Compte neuf avec son premier appareil. */
  readonly givenAccount: () => Promise<{ accountId: string; deviceId: string }>;
  /** Appareil de plus pour un compte existant. */
  readonly givenDevice: (accountId: string) => Promise<string>;
  readonly givenDays: (deviceId: string, days: readonly [string, number][]) => Promise<void>;
}

// Semaine du lundi 2 au dimanche 8 novembre 2026.
const week = () => unwrap(IsoWeek.create('2026-W45'));
const rows = (ranking: readonly RankedMember[] | undefined) =>
  (ranking ?? []).map(({ rank, nickname, steps }) => [rank, nickname.value, steps]);

/** Contrat du port RankingQuery (voir deviceRepositoryContract). */
export const rankingQueryContract = (fixture: () => RankingQueryFixture): void => {
  const member = async (f: RankingQueryFixture, nickname: string) => {
    const ids = await f.givenAccount();
    await f.accounts.setNickname(ids.accountId, unwrap(Nickname.create(nickname)));
    return ids;
  };
  // Groupe dont les membres arrivent dans l'ordre donné.
  const group = async (f: RankingQueryFixture, accountIds: readonly string[]) => {
    const [first, ...others] = accountIds;
    const code = `code-${randomUUID()}`;
    const created = await f.groups.create(first ?? '', unwrap(GroupName.create('Bureau')), code);
    for (const accountId of others) unwrap(await f.groups.join(accountId, code, 50));
    return created.id;
  };

  it('classe les membres par total de la semaine, membres sans pas compris', async () => {
    const f = fixture();
    const zoe = await member(f, 'Zoé');
    const paul = await member(f, 'Paul');
    const lea = await member(f, 'Léa');
    await f.givenDays(zoe.deviceId, [
      ['2026-11-02', 9_000],
      ['2026-11-03', 9_000],
    ]);
    await f.givenDays(paul.deviceId, [['2026-11-04', 25_000]]);
    const groupId = await group(f, [zoe.accountId, paul.accountId, lea.accountId]);

    const rankings = await f.query.weeklyRankings([groupId], week());

    expect(rows(rankings.get(groupId))).toEqual([
      [1, 'Paul', 25_000],
      [2, 'Zoé', 18_000],
      [3, 'Léa', 0],
    ]);
  });

  it('prend le maximum par jour entre les appareils d’un membre, sur les jours de la semaine', async () => {
    const f = fixture();
    const zoe = await member(f, 'Zoé');
    const watch = await f.givenDevice(zoe.accountId);
    await f.givenDays(zoe.deviceId, [
      ['2026-11-01', 50_000],
      ['2026-11-02', 8_000],
      ['2026-11-09', 50_000],
    ]);
    await f.givenDays(watch, [
      ['2026-11-02', 7_000],
      ['2026-11-08', 500],
    ]);
    const groupId = await group(f, [zoe.accountId]);

    const rankings = await f.query.weeklyRankings([groupId], week());

    expect(rows(rankings.get(groupId))).toEqual([[1, 'Zoé', 8_500]]);
  });

  it('donne le même rang aux ex æquo, puis saute les rangs (1, 1, 3)', async () => {
    const f = fixture();
    const members = await Promise.all(['Ana', 'Ben', 'Cléo'].map((name) => member(f, name)));
    const steps = [10_000, 10_000, 4_000];
    for (const [i, { deviceId }] of members.entries()) {
      await f.givenDays(deviceId, [['2026-11-05', steps[i] ?? 0]]);
    }
    const groupId = await group(
      f,
      members.map(({ accountId }) => accountId),
    );

    const ranking = (await f.query.weeklyRankings([groupId], week())).get(groupId) ?? [];

    expect(ranking.map(({ rank, steps: total }) => [rank, total])).toEqual([
      [1, 10_000],
      [1, 10_000],
      [3, 4_000],
    ]);
    // Entre ex æquo : ordre de l'identifiant, indépendant de l'ordre d'arrivée.
    const [first, second] = ranking;
    expect((first?.accountId ?? '') < (second?.accountId ?? '')).toBe(true);
  });

  it('classe plusieurs groupes en une lecture, chacun à part ; ignore un groupe inconnu', async () => {
    const f = fixture();
    const zoe = await member(f, 'Zoé');
    const paul = await member(f, 'Paul');
    await f.givenDays(zoe.deviceId, [['2026-11-02', 1_000]]);
    await f.givenDays(paul.deviceId, [['2026-11-02', 2_000]]);
    const both = await group(f, [zoe.accountId, paul.accountId]);
    const alone = await group(f, [zoe.accountId]);
    const unknown = randomUUID();

    const rankings = await f.query.weeklyRankings([both, alone, unknown], week());

    expect(rows(rankings.get(both))).toEqual([
      [1, 'Paul', 2_000],
      [2, 'Zoé', 1_000],
    ]);
    expect(rows(rankings.get(alone))).toEqual([[1, 'Zoé', 1_000]]);
    expect(rankings.has(unknown)).toBe(false);
  });
};

/** Pas par jour au format du domaine, pour les fixtures qui passent par lui. */
export const dailyStepsOf = (days: readonly [string, number][]) =>
  days.map(([date, steps]) => ({
    date: unwrap(LocalDate.create(date)),
    steps: unwrap(StepCount.create(steps)),
  }));
