import { Inject, Injectable } from '@nestjs/common';
import { err, GroupName, type InvalidGroupName, ok, type Result } from '@stepbystep/domain';
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

/** Taille maximale d'un groupe : un défi entre amis, pas un classement public. */
export const MAX_GROUP_MEMBERS = 50;

/** Ce que voit un membre : les pseudos, et lequel est le sien (pas les identifiants des autres). */
export interface GroupView {
  readonly groupId: string;
  readonly name: string;
  readonly inviteCode: string;
  readonly members: readonly { readonly nickname: string; readonly you: boolean }[];
}

type EntryError = AccountNotFound | NicknameRequired;

/** Groupes d'amis : créer, rejoindre par un code, quitter, lister (ADR 0002, décision 18). */
@Injectable()
export class GroupsService {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(GROUP_REPOSITORY) private readonly groups: GroupRepository,
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
