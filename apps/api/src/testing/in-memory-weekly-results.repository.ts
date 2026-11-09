import type { IsoWeek } from '@stepbystep/domain';
import type { RankedMember } from '../groups/ranking.query.js';
import type { RankGroups, WeeklyResultsRepository } from '../groups/weekly-results.repository.js';
import type { InMemoryGroupRepository } from './in-memory-group.repository.js';

/**
 * Adapter en mémoire de WeeklyResultsRepository, tenu par le même contrat que l'adapter
 * PostgreSQL. Le verrou consultatif devient un drapeau : une clôture en cours fait renvoyer
 * `undefined` aux suivantes. Les groupes connus sont ceux du fake des groupes (base partagée).
 */
export class InMemoryWeeklyResultsRepository implements WeeklyResultsRepository {
  /** Semaine → (groupe → classement figé). */
  private readonly results = new Map<string, Map<string, RankedMember[]>>();
  private closing = false;

  constructor(private readonly groups: InMemoryGroupRepository) {}

  async closeWeek(week: IsoWeek, rank: RankGroups): Promise<number | undefined> {
    if (this.closing) return undefined;
    this.closing = true;
    try {
      const closed = this.results.get(week.toString()) ?? new Map<string, RankedMember[]>();
      const toClose = this.groups.ids().filter((groupId) => !closed.has(groupId));
      if (toClose.length === 0) return 0;
      const rankings = await rank(toClose);
      // Tout ou rien : les classements ne sont enregistrés qu'une fois tous calculés.
      for (const [groupId, ranking] of rankings) closed.set(groupId, ranking);
      this.results.set(week.toString(), closed);
      return toClose.length;
    } finally {
      this.closing = false;
    }
  }

  resultsOf(groupId: string, week: IsoWeek): Promise<RankedMember[] | undefined> {
    return Promise.resolve(this.results.get(week.toString())?.get(groupId));
  }

  /** Retire un compte supprimé des classements figés (clé étrangère ON DELETE CASCADE). */
  forgetAccount(accountId: string): void {
    for (const byGroup of this.results.values()) {
      for (const [groupId, ranking] of byGroup) {
        const kept = ranking.filter((member) => member.accountId !== accountId);
        if (kept.length === 0) byGroup.delete(groupId);
        else byGroup.set(groupId, kept);
      }
    }
  }
}
