import { Injectable } from '@nestjs/common';
import { type IsoWeek, Nickname } from '@stepbystep/domain';
import { DataSource } from 'typeorm';
import type { RankedMember } from '../../groups/ranking.query.js';
import type {
  RankGroups,
  WeeklyResultsRepository,
} from '../../groups/weekly-results.repository.js';
import { stored } from './stored.js';

// Clé du verrou consultatif de la clôture : un entier choisi pour cet usage, et seulement lui.
const CLOSING_LOCK_KEY = 4_502_202_611;

interface ResultRow {
  readonly accountId: string;
  readonly nickname: string | null;
  readonly steps: number;
  readonly rank: number;
}

/**
 * Adapter PostgreSQL du port WeeklyResultsRepository. Deux protections, chacune avec son rôle :
 * - un verrou consultatif de transaction (pg_try_advisory_xact_lock) : une seule clôture à la
 *   fois ; une instance qui le trouve pris passe son tour au lieu de refaire le même travail ;
 * - la clé primaire (groupe, semaine, membre) avec ON CONFLICT DO NOTHING : même si le verrou
 *   était contourné, une semaine ne serait figée qu'une fois. Le verrou évite le travail en
 *   double, la clé garantit le résultat.
 * Les groupes à clore sont verrouillés en partage (FOR SHARE) : ni arrivée, ni départ, ni
 * suppression de compte ne change leurs membres pendant qu'on fige leur classement.
 */
@Injectable()
export class TypeOrmWeeklyResultsRepository implements WeeklyResultsRepository {
  constructor(private readonly dataSource: DataSource) {}

  closeWeek(week: IsoWeek, rank: RankGroups): Promise<number | undefined> {
    return this.dataSource.transaction(async (manager) => {
      const [{ locked }]: [{ locked: boolean }] = await manager.query(
        'SELECT pg_try_advisory_xact_lock($1) AS locked',
        [CLOSING_LOCK_KEY],
      );
      if (!locked) return undefined;

      const groups: { id: string }[] = await manager.query(
        `SELECT g.id FROM groups g
         WHERE NOT EXISTS (
           SELECT 1 FROM weekly_results r WHERE r.group_id = g.id AND r.week = $1)
         ORDER BY g.id
         FOR SHARE OF g`,
        [week.toString()],
      );
      if (groups.length === 0) return 0;

      const rankings = await rank(groups.map(({ id }) => id));
      const rows = [...rankings].flatMap(([groupId, ranking]) =>
        ranking.map(({ accountId, steps, rank: place }) => ({ groupId, accountId, steps, place })),
      );
      await manager.query(
        `INSERT INTO weekly_results (group_id, week, account_id, steps, rank)
         SELECT group_id, $1, account_id, steps, rank
         FROM unnest($2::uuid[], $3::uuid[], $4::integer[], $5::integer[])
           AS result (group_id, account_id, steps, rank)
         ON CONFLICT DO NOTHING`,
        [
          week.toString(),
          rows.map(({ groupId }) => groupId),
          rows.map(({ accountId }) => accountId),
          rows.map(({ steps }) => steps),
          rows.map(({ place }) => place),
        ],
      );
      return groups.length;
    });
  }

  async resultsOf(groupId: string, week: IsoWeek): Promise<RankedMember[] | undefined> {
    const rows: ResultRow[] = await this.dataSource.query(
      `SELECT r.account_id AS "accountId", a.nickname, r.steps, r.rank
       FROM weekly_results r JOIN accounts a ON a.id = r.account_id
       WHERE r.group_id = $1 AND r.week = $2
       ORDER BY r.rank, r.account_id`,
      [groupId, week.toString()],
    );
    if (rows.length === 0) return undefined;
    return rows.map(({ accountId, nickname, steps, rank }) => ({
      accountId,
      // Un pseudo est exigé pour entrer dans un groupe et ne peut pas être retiré.
      nickname: stored(Nickname.create(nickname ?? '')),
      steps,
      rank,
    }));
  }
}
