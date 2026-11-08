import { CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { AccountEntity } from './account.entity.js';
import { GroupEntity } from './group.entity.js';

/**
 * Appartenance d'un compte à un groupe. Supprimer le compte ou le groupe supprime
 * l'appartenance (ON DELETE CASCADE) ; un groupe vidé est supprimé par le dépôt.
 */
@Entity({ name: 'group_members' })
export class GroupMemberEntity {
  @PrimaryColumn({ name: 'group_id', type: 'uuid' })
  groupId!: string;

  // Indexé : « mes groupes », et la cascade à la suppression d'un compte.
  @Index('IDX_group_members_account_id')
  @PrimaryColumn({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @CreateDateColumn({ name: 'joined_at', type: 'timestamptz' })
  joinedAt!: Date;

  @ManyToOne(() => GroupEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'group_id' })
  group?: GroupEntity;

  @ManyToOne(() => AccountEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'account_id' })
  account?: AccountEntity;
}
