import { Inject, Injectable } from '@nestjs/common';
import {
  err,
  GroupName,
  type InvalidGroupName,
  type InvalidIsoWeek,
  IsoWeek,
  ok,
  type Result,
} from '@stepbystep/domain';
import { ACCOUNT_REPOSITORY, type AccountRepository } from '../accounts/account.repository.js';
import type { AccountNotFound } from '../goals/goals.service.js';
import type { NicknameRequired } from './group-errors.js';
import {
  GROUP_REPOSITORY,
  type Group,
  type GroupFull,
  type GroupRepository,
  type InviteCodeUnknown,
} from './group.repository.js';
import { newInviteCode } from './invite-code.js';
import { RANKING_QUERY, type RankingQuery } from './ranking.query.js';

/** Taille maximale d'un groupe : un défi entre amis, pas un classement public. */
export const MAX_GROUP_MEMBERS = 50;

/** Ce que voit un membre : les pseudos, et lequel est le sien (pas les identifiants des autres). */
export interface GroupView {
  readonly groupId: string;
  readonly name: string;
  readonly inviteCode: string;
  readonly members: readonly { readonly nickname: string; readonly you: boolean }[];
}

/** Classement d'un groupe pour une semaine ISO, du premier au dernier. */
export interface RankingView {
  readonly groupId: string;
  readonly week: string;
  readonly from: string;
  readonly to: string;
  readonly ranking: readonly {
    readonly rank: number;
    readonly nickname: string;
    readonly steps: number;
    readonly you: boolean;
  }[];
}

/** Groupe inconnu, ou dont le compte n'est pas membre : indiscernables, pour ne rien révéler. */
export interface GroupNotFound {
  readonly kind: 'GroupNotFound';
  readonly groupId: string;
}

type EntryError = AccountNotFound | NicknameRequired;

/** Groupes d'amis : créer, rejoindre par un code, quitter, lister (ADR 0002, décision 18). */
@Injectable()
export class GroupsService {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(GROUP_REPOSITORY) private readonly groups: GroupRepository,
    @Inject(RANKING_QUERY) private readonly rankings: RankingQuery,
  ) {}

  async create(
    accountId: string,
    name: string,
  ): Promise<Result<GroupView, EntryError | InvalidGroupName>> {
    const groupName = GroupName.create(name);
    if (!groupName.ok) return groupName;
    const entry = await this.canEnter(accountId);
    if (!entry.ok) return entry;
    const group = await this.groups.create(accountId, groupName.value, newInviteCode());
    return ok(view(group, accountId));
  }

  async join(
    accountId: string,
    inviteCode: string,
  ): Promise<Result<GroupView, EntryError | InviteCodeUnknown | GroupFull>> {
    const entry = await this.canEnter(accountId);
    if (!entry.ok) return entry;
    const group = await this.groups.join(accountId, inviteCode, MAX_GROUP_MEMBERS);
    return group.ok ? ok(view(group.value, accountId)) : group;
  }

  /** Quitter un groupe : idempotent, et le groupe disparaît avec son dernier membre. */
  leave(accountId: string, groupId: string): Promise<void> {
    return this.groups.leave(accountId, groupId);
  }

  async list(accountId: string): Promise<GroupView[]> {
    return (await this.groups.groupsOf(accountId)).map((group) => view(group, accountId));
  }

  /**
   * Classement de la semaine dans un groupe dont le compte est membre (ADR 0002, décision 19).
   * La semaine est fournie par l'appareil, qui connaît la date locale de l'utilisateur.
   */
  async ranking(
    accountId: string,
    groupId: string,
    week: string,
  ): Promise<Result<RankingView, InvalidIsoWeek | GroupNotFound>> {
    const isoWeek = IsoWeek.create(week);
    if (!isoWeek.ok) return isoWeek;
    const isMember = (await this.groups.groupsOf(accountId)).some(({ id }) => id === groupId);
    if (!isMember) return err({ kind: 'GroupNotFound', groupId });
    const ranking = (await this.rankings.weeklyRankings([groupId], isoWeek.value)).get(groupId);
    return ok({
      groupId,
      week: isoWeek.value.toString(),
      from: isoWeek.value.start.toString(),
      to: isoWeek.value.end.toString(),
      ranking: (ranking ?? []).map((member) => ({
        rank: member.rank,
        nickname: member.nickname.value,
        steps: member.steps,
        you: member.accountId === accountId,
      })),
    });
  }

  /** Un compte entre dans un groupe s'il existe et s'il a un pseudo à montrer aux autres. */
  private async canEnter(accountId: string): Promise<Result<undefined, EntryError>> {
    if (!(await this.accounts.exists(accountId))) {
      return err({ kind: 'AccountNotFound', accountId });
    }
    if ((await this.accounts.nicknameOf(accountId)) === undefined) {
      return err({ kind: 'NicknameRequired' });
    }
    return ok(undefined);
  }
}

const view = ({ id, name, inviteCode, members }: Group, accountId: string): GroupView => ({
  groupId: id,
  name: name.value,
  inviteCode,
  members: members.map((member) => ({
    nickname: member.nickname.value,
    you: member.accountId === accountId,
  })),
});
