import { Injectable } from '@nestjs/common';
import { err, GroupName, Nickname, ok, type Result } from '@stepbystep/domain';
import { DataSource, type EntityManager } from 'typeorm';
import type {
  Group,
  GroupFull,
  GroupRepository,
  InviteCodeUnknown,
} from '../../groups/group.repository.js';
import { GroupMemberEntity } from '../entities/group-member.entity.js';
import { GroupEntity } from '../entities/group.entity.js';
import { stored } from './stored.js';

interface GroupRow {
  readonly id: string;
  readonly name: string;
  readonly invite_code: string;
}

interface MemberRow {
  readonly group_id: string;
  readonly account_id: string;
  readonly nickname: string | null;
}

/**
 * Adapter PostgreSQL (TypeORM) du port GroupRepository. Chaque opération qui change les membres
 * d'un groupe commence par verrouiller sa ligne (SELECT … FOR UPDATE), dans une transaction :
 * compter les membres puis en ajouter un, ou retirer le dernier puis supprimer le groupe, se
 * fait sans qu'une autre opération sur ce groupe s'intercale, même depuis une autre instance de
 * l'API. Les autres groupes ne sont pas bloqués.
 */
@Injectable()
export class TypeOrmGroupRepository implements GroupRepository {
  constructor(private readonly dataSource: DataSource) {}

  create(accountId: string, name: GroupName, inviteCode: string): Promise<Group> {
    return this.dataSource.transaction(async (manager) => {
      const { id } = await manager
        .getRepository(GroupEntity)
        .save({ name: name.value, inviteCode });
      await manager.getRepository(GroupMemberEntity).insert({ groupId: id, accountId });
      return this.loadOne(manager, id);
    });
  }

  join(
    accountId: string,
    inviteCode: string,
    maxMembers: number,
  ): Promise<Result<Group, InviteCodeUnknown | GroupFull>> {
    return this.dataSource.transaction(async (manager) => {
      const [group]: { id: string }[] = await manager.query(
        'SELECT id FROM groups WHERE invite_code = $1 FOR UPDATE',
        [inviteCode],
      );
      if (group === undefined) return err({ kind: 'InviteCodeUnknown' as const });

      const members = manager.getRepository(GroupMemberEntity);
      if (!(await members.existsBy({ groupId: group.id, accountId }))) {
        // Compté sous le verrou du groupe : deux arrivées simultanées ne dépassent pas la limite.
        if ((await members.countBy({ groupId: group.id })) >= maxMembers) {
          return err({ kind: 'GroupFull' as const, maxMembers });
        }
        await members.insert({ groupId: group.id, accountId });
      }
      return ok(await this.loadOne(manager, group.id));
    });
  }

  async leave(accountId: string, groupId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const locked: unknown[] = await manager.query(
        'SELECT id FROM groups WHERE id = $1 FOR UPDATE',
        [groupId],
      );
      if (locked.length === 0) return;
      await manager.getRepository(GroupMemberEntity).delete({ groupId, accountId });
      await deleteEmptyGroups(manager, [groupId]);
    });
  }

  async groupsOf(accountId: string): Promise<Group[]> {
    const rows: GroupRow[] = await this.dataSource.query(
      `SELECT g.id, g.name, g.invite_code FROM groups g
       JOIN group_members m ON m.group_id = g.id
       WHERE m.account_id = $1
       ORDER BY m.joined_at, g.id`,
      [accountId],
    );
    return this.withMembers(this.dataSource.manager, rows);
  }

  private async loadOne(manager: EntityManager, groupId: string): Promise<Group> {
    const rows: GroupRow[] = await manager.query(
      'SELECT id, name, invite_code FROM groups WHERE id = $1',
      [groupId],
    );
    const [group] = await this.withMembers(manager, rows);
    if (group === undefined) throw new Error(`Groupe introuvable dans sa transaction : ${groupId}`);
    return group;
  }

  /** Ajoute les membres (avec leur pseudo) aux groupes lus, en une requête. */
  private async withMembers(manager: EntityManager, groups: readonly GroupRow[]): Promise<Group[]> {
    if (groups.length === 0) return [];
    const members: MemberRow[] = await manager.query(
      `SELECT m.group_id, m.account_id, a.nickname FROM group_members m
       JOIN accounts a ON a.id = m.account_id
       WHERE m.group_id = ANY($1::uuid[])
       ORDER BY m.joined_at, m.account_id`,
      [groups.map(({ id }) => id)],
    );
    return groups.map((row) => ({
      id: row.id,
      name: stored(GroupName.create(row.name)),
      inviteCode: row.invite_code,
      members: members
        .filter(({ group_id }) => group_id === row.id)
        .map(({ account_id, nickname }) => ({
          accountId: account_id,
          // Un pseudo est exigé pour entrer dans un groupe et ne peut pas être retiré.
          nickname: stored(Nickname.create(nickname ?? '')),
        })),
    }));
  }
}

/** Supprime, parmi ces groupes (déjà verrouillés), ceux qui n'ont plus aucun membre. */
export const deleteEmptyGroups = async (
  manager: EntityManager,
  groupIds: readonly string[],
): Promise<void> => {
  if (groupIds.length === 0) return;
  await manager.query(
    `DELETE FROM groups g WHERE g.id = ANY($1::uuid[])
     AND NOT EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = g.id)`,
    [groupIds],
  );
};
