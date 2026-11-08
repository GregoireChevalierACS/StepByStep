import { type IsoWeek, weeklyRanking } from '@stepbystep/domain';
import type { RankedMember, RankingQuery } from '../groups/ranking.query.js';
import type { InMemoryStores } from './in-memory-stores.js';

/**
 * Adapter en mémoire de RankingQuery : la fonction de référence du domaine (weeklyRanking),
 * appliquée aux données des autres fakes. Tenu par le même contrat que l'adapter PostgreSQL.
 */
export class InMemoryRankingQuery implements RankingQuery {
  constructor(private readonly stores: InMemoryStores) {}

  async weeklyRankings(
    groupIds: readonly string[],
    week: IsoWeek,
  ): Promise<Map<string, RankedMember[]>> {
    const { devices, dailySteps, groups, nicknames } = this.stores;
    const rankings = new Map<string, RankedMember[]>();
    for (const groupId of new Set(groupIds)) {
      const members = groups.membersOf(groupId);
      if (members === undefined) continue;
      const activities = await Promise.all(
        members.map(async (memberId) => ({
          memberId,
          devices: await Promise.all(
            devices
              .devicesOf(memberId)
              .map((deviceId) => dailySteps.between(deviceId, week.start, week.end)),
          ),
        })),
      );
      rankings.set(
        groupId,
        weeklyRanking(week, activities).map(({ memberId, steps, rank }) => {
          const nickname = nicknames.get(memberId);
          if (nickname === undefined) throw new Error(`Membre sans pseudo : ${memberId}`);
          return { accountId: memberId, nickname, steps: steps.value, rank };
        }),
      );
    }
    return rankings;
  }
}
