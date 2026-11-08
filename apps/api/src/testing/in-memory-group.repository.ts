import { err, type GroupName, type Nickname, ok, type Result } from '@stepbystep/domain';
import { randomUUID } from 'node:crypto';
import type {
  Group,
  GroupFull,
  GroupRepository,
  InviteCodeUnknown,
} from '../groups/group.repository.js';

interface StoredGroup {
  readonly id: string;
  readonly name: GroupName;
  readonly inviteCode: string;
  /** Membres dans l'ordre d'arrivée. */
  readonly members: string[];
}

/**
 * Adapter en mémoire de GroupRepository, tenu par le même contrat que l'adapter PostgreSQL.
 * Chaque opération s'exécute sans `await` intermédiaire : JavaScript ne l'interrompt pas, ce
 * qui tient lieu du verrou de groupe de la base. Les pseudos sont ceux des comptes (partagés).
 */
export class InMemoryGroupRepository implements GroupRepository {
  private readonly groups = new Map<string, StoredGroup>();

  constructor(private readonly nicknames: ReadonlyMap<string, Nickname>) {}

  create(accountId: string, name: GroupName, inviteCode: string): Promise<Group> {
    const group = { id: randomUUID(), name, inviteCode, members: [accountId] };
    this.groups.set(group.id, group);
    return Promise.resolve(this.view(group));
  }

  join(
    accountId: string,
    inviteCode: string,
    maxMembers: number,
  ): Promise<Result<Group, InviteCodeUnknown | GroupFull>> {
    const group = [...this.groups.values()].find((stored) => stored.inviteCode === inviteCode);
    if (group === undefined) return Promise.resolve(err({ kind: 'InviteCodeUnknown' }));
    if (!group.members.includes(accountId)) {
      if (group.members.length >= maxMembers) {
        return Promise.resolve(err({ kind: 'GroupFull', maxMembers }));
      }
      group.members.push(accountId);
    }
    return Promise.resolve(ok(this.view(group)));
  }

  leave(accountId: string, groupId: string): Promise<void> {
    const group = this.groups.get(groupId);
    if (group !== undefined) this.remove(group, accountId);
    return Promise.resolve();
  }

  groupsOf(accountId: string): Promise<Group[]> {
    // Map : ordre de création ; un compte rejoint au plus une fois chaque groupe.
    return Promise.resolve(
      [...this.groups.values()]
        .filter(({ members }) => members.includes(accountId))
        .map((group) => this.view(group)),
    );
  }

  /** Retire un compte supprimé de tous ses groupes (clés étrangères ON DELETE CASCADE). */
  forgetAccount(accountId: string): void {
    for (const group of this.groups.values()) this.remove(group, accountId);
  }

  private remove(group: StoredGroup, accountId: string): void {
    const index = group.members.indexOf(accountId);
    if (index >= 0) group.members.splice(index, 1);
    // Un groupe n'existe qu'avec au moins un membre.
    if (group.members.length === 0) this.groups.delete(group.id);
  }

  private view({ id, name, inviteCode, members }: StoredGroup): Group {
    return {
      id,
      name,
      inviteCode,
      members: members.map((accountId) => {
        const nickname = this.nicknames.get(accountId);
        if (nickname === undefined) throw new Error(`Membre sans pseudo : ${accountId}`);
        return { accountId, nickname };
      }),
    };
  }
}
