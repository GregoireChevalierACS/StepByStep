import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { AccountEntity } from './account.entity.js';
import { GroupEntity } from './group.entity.js';

/**
 * Classement figé d'un groupe pour une semaine close (défi terminé). La clé primaire (groupe,
 * semaine, membre) rend la clôture idempotente : une semaine n'est figée qu'une fois, même si
 * deux clôtures se chevauchent. Supprimer le groupe ou le compte supprime ses résultats.
 */
@Entity({ name: 'weekly_results' })
@Check('CHK_weekly_results_rank', '"rank" >= 1')
@Check('CHK_weekly_results_steps', '"steps" >= 0')
export class WeeklyResultEntity {
  @PrimaryColumn({ name: 'group_id', type: 'uuid' })
  groupId!: string;

  // Semaine ISO, AAAA-Wss. Avec group_id en tête de la clé : « ce groupe est-il clos ? ».
  @PrimaryColumn({ name: 'week', type: 'text' })
  week!: string;

  // Indexé : sans index, chaque suppression de compte parcourrait tous les résultats.
  @Index('IDX_weekly_results_account_id')
  @PrimaryColumn({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @Column({ name: 'rank', type: 'integer' })
  rank!: number;

  @Column({ name: 'steps', type: 'integer' })
  steps!: number;

  @CreateDateColumn({ name: 'closed_at', type: 'timestamptz' })
  closedAt!: Date;

  @ManyToOne(() => GroupEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'group_id' })
  group?: GroupEntity;

  @ManyToOne(() => AccountEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'account_id' })
  account?: AccountEntity;
}
