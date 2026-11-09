import { Injectable } from '@nestjs/common';
import { type IsoWeek, Nickname } from '@stepbystep/domain';
import { DataSource } from 'typeorm';
import type { RankedMember, RankingQuery } from '../../groups/ranking.query.js';
import { stored } from './stored.js';

/**
 * Classement de plusieurs groupes en une requête : pas d'un compte par jour = MAX parmi ses
 * appareils (un téléphone et une montre ne comptent pas deux fois), somme sur la semaine, puis
 * RANK() par groupe (PARTITION BY). LEFT JOIN : un membre sans aucun pas figure à 0. Index
 * utilisés : clés primaires de group_members (group_id, account_id) et de daily_steps
 * (device_id, day), index de devices.account_id (mesures dans l'ADR 0002, décision 19).
 */
const WEEKLY_RANKINGS_SQL = `
WITH members AS (
  SELECT member.group_id, member.account_id, account.nickname
  FROM group_members member
  JOIN accounts account ON account.id = member.account_id
  WHERE member.group_id = ANY($1::uuid[])
),
account_days AS (
  SELECT device.account_id, daily.day, MAX(daily.steps) AS steps
  FROM devices device
  JOIN daily_steps daily ON daily.device_id = device.id AND daily.day BETWEEN $2 AND $3
  WHERE device.account_id IN (SELECT account_id FROM members)
  GROUP BY device.account_id, daily.day
),
totals AS (
  SELECT member.group_id, member.account_id, member.nickname,
         COALESCE(SUM(account_days.steps), 0)::integer AS steps
  FROM members member
  LEFT JOIN account_days ON account_days.account_id = member.account_id
  GROUP BY member.group_id, member.account_id, member.nickname
)
SELECT group_id AS "groupId", account_id AS "accountId", nickname, steps,
       RANK() OVER (PARTITION BY group_id ORDER BY steps DESC)::integer AS rank
FROM totals
ORDER BY group_id, steps DESC, account_id
`;

interface RankingRow {
  readonly groupId: string;
  readonly accountId: string;
  readonly nickname: string | null;
  readonly steps: number;
  readonly rank: number;
}

/** Adapter PostgreSQL du port RankingQuery. */
@Injectable()
export class TypeOrmRankingQuery implements RankingQuery {
  constructor(private readonly dataSource: DataSource) {}

  async weeklyRankings(
    groupIds: readonly string[],
    week: IsoWeek,
  ): Promise<Map<string, RankedMember[]>> {
    const rows: RankingRow[] = await this.dataSource.query(WEEKLY_RANKINGS_SQL, [
      groupIds,
      week.start.toString(),
      week.end.toString(),
    ]);
    const rankings = new Map<string, RankedMember[]>();
    for (const { groupId, accountId, nickname, steps, rank } of rows) {
      const ranking = rankings.get(groupId) ?? [];
      // Un pseudo est exigé pour entrer dans un groupe et ne peut pas être retiré.
      ranking.push({ accountId, nickname: stored(Nickname.create(nickname ?? '')), steps, rank });
      rankings.set(groupId, ranking);
    }
    return rankings;
  }
}
