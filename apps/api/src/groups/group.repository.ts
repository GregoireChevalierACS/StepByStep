import type { GroupName, Nickname, Result } from '@stepbystep/domain';

export interface GroupMember {
  readonly accountId: string;
  readonly nickname: Nickname;
}

/** Groupe d'amis, avec ses membres dans l'ordre où ils l'ont rejoint. */
export interface Group {
  readonly id: string;
  readonly name: GroupName;
  readonly inviteCode: string;
  readonly members: readonly GroupMember[];
}

export interface InviteCodeUnknown {
  readonly kind: 'InviteCodeUnknown';
}

export interface GroupFull {
  readonly kind: 'GroupFull';
  readonly maxMembers: number;
}

/**
 * Port de persistance des groupes (voir DeviceRepository). Invariant : un groupe n'existe
 * qu'avec au moins un membre. Il est supprimé avec son dernier membre, qu'il parte ou que son
 * compte soit supprimé (AccountRepository.delete). Les opérations sur un groupe sont
 * sérialisées : deux arrivées simultanées ne dépassent pas la taille maximale, et un groupe
 * vidé ne reçoit pas de membre pendant sa suppression.
 */
export interface GroupRepository {
  /** Crée le groupe, son créateur pour premier membre. Le code d'invitation doit être neuf. */
  create(accountId: string, name: GroupName, inviteCode: string): Promise<Group>;

  /**
   * Ajoute le compte au groupe de ce code, s'il compte moins de `maxMembers` membres. Déjà
   * membre : sans effet, le groupe est renvoyé (une demande renvoyée aboutit).
   */
  join(
    accountId: string,
    inviteCode: string,
    maxMembers: number,
  ): Promise<Result<Group, InviteCodeUnknown | GroupFull>>;

  /** Retire le compte du groupe, supprimé s'il est vide. Sans effet s'il n'en est pas membre. */
  leave(accountId: string, groupId: string): Promise<void>;

  /** Groupes dont le compte est membre, dans l'ordre où il les a rejoints. */
  groupsOf(accountId: string): Promise<Group[]>;
}

export const GROUP_REPOSITORY = Symbol('GROUP_REPOSITORY');
