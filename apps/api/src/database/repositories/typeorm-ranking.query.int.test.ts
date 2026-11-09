import { randomUUID } from 'node:crypto';
import { IsoWeek, LocalDate, StepCount, weeklyRanking } from '@stepbystep/domain';
import fc from 'fast-check';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { unwrap } from '../../testing/unwrap.js';
import { dataSourceOptions } from '../data-source-options.js';
import { TypeOrmRankingQuery } from './typeorm-ranking.query.js';

// Semaine du lundi 2 au dimanche 8 novembre 2026 ; les jours générés débordent de part et
// d'autre, pour vérifier aussi les bornes de la semaine.
const MONDAY = '2026-11-02';
const dayAt = (offset: number) => unwrap(LocalDate.create(MONDAY)).plusDays(offset);

/** Un compte : ses appareils, chacun avec ses pas par jour (décalage depuis le lundi). */
type AccountHistory = readonly (readonly { readonly offset: number; readonly steps: number }[])[];

// Totaux proches les uns des autres pour provoquer des ex æquo.
const STEPS = [0, 1_000, 5_000, 5_000, 10_000];
const accountHistory: fc.Arbitrary<AccountHistory> = fc.array(
  fc.uniqueArray(
    fc.record({ offset: fc.integer({ min: -3, max: 9 }), steps: fc.constantFrom(...STEPS) }),
    { selector: ({ offset }) => offset, maxLength: 8 },
  ),
  { minLength: 1, maxLength: 2 },
);

describe('TypeOrmRankingQuery : équivalence avec weeklyRanking du domaine', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await new DataSource(dataSourceOptions(inject('databaseUrl'))).initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  // Comptes neufs (avec pseudo, appareils et pas), puis groupes : chaque groupe reçoit les
  // comptes désignés par leurs indices. Renvoie les identifiants créés.
  // Identifiants choisis ici : une seule insertion par table (unnest), pas une par ligne.
  const given = async (accounts: readonly AccountHistory[], groups: readonly number[][]) => {
    const accountIds = accounts.map(() => randomUUID());
    const devices = accounts.flatMap((days, index) =>
      days.map((history) => ({ id: randomUUID(), accountId: accountIds[index], history })),
    );
    const days = devices.flatMap(({ id, history }) =>
      history.map(({ offset, steps }) => ({ id, day: dayAt(offset).toString(), steps })),
    );
    const groupIds = groups.map(() => randomUUID());
    const members = groups.flatMap((indices, g) =>
      [...new Set(indices)].map((index) => ({
        groupId: groupIds[g],
        accountId: accountIds[index],
      })),
    );

    await dataSource.query(
      'INSERT INTO accounts (id, nickname) SELECT * FROM unnest($1::uuid[], $2::text[])',
      [accountIds, accountIds.map((_, index) => `Membre ${String(index)}`)],
    );
    await dataSource.query(
      'INSERT INTO devices (id, account_id) SELECT * FROM unnest($1::uuid[], $2::uuid[])',
      [devices.map(({ id }) => id), devices.map(({ accountId }) => accountId)],
    );
    await dataSource.query(
      `INSERT INTO daily_steps (device_id, day, steps)
       SELECT * FROM unnest($1::uuid[], $2::date[], $3::integer[])`,
      [days.map(({ id }) => id), days.map(({ day }) => day), days.map(({ steps }) => steps)],
    );
    await dataSource.query(
      `INSERT INTO groups (id, name, invite_code)
       SELECT id, 'Bureau', id::text FROM unnest($1::uuid[]) AS id`,
      [groupIds],
    );
    await dataSource.query(
      'INSERT INTO group_members (group_id, account_id) SELECT * FROM unnest($1::uuid[], $2::uuid[])',
      [members.map(({ groupId }) => groupId), members.map(({ accountId }) => accountId)],
    );
    return { accountIds, groupIds };
  };

  it('donne toujours le classement du domaine, groupe par groupe (propriété)', async () => {
    const week = unwrap(IsoWeek.create('2026-W45'));
    const scenario = fc.array(accountHistory, { minLength: 1, maxLength: 4 }).chain((accounts) =>
      fc.record({
        accounts: fc.constant(accounts),
        groups: fc.array(
          fc.array(fc.integer({ min: 0, max: accounts.length - 1 }), { minLength: 1 }),
          { minLength: 1, maxLength: 2 },
        ),
      }),
    );

    await fc.assert(
      fc.asyncProperty(scenario, async ({ accounts, groups }) => {
        const { accountIds, groupIds } = await given(accounts, groups);

        const rankings = await new TypeOrmRankingQuery(dataSource).weeklyRankings(groupIds, week);

        for (const [g, members] of groups.entries()) {
          const expected = weeklyRanking(
            week,
            [...new Set(members)].map((index) => ({
              memberId: accountIds[index] ?? '',
              devices: (accounts[index] ?? []).map((days) =>
                days.map(({ offset, steps }) => ({
                  date: dayAt(offset),
                  steps: unwrap(StepCount.create(steps)),
                })),
              ),
            })),
          ).map(({ memberId, steps, rank }) => [rank, memberId, steps.value]);
          const actual = (rankings.get(groupIds[g] ?? '') ?? []).map(
            ({ rank, accountId, steps }) => [rank, accountId, steps],
          );

          expect(actual).toEqual(expected);
        }
      }),
      { numRuns: 60 },
    );
  });
});
