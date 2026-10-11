import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AccountEntity } from './account.entity.js';

/** Appareil (téléphone) : plusieurs appareils pour un compte. */
@Entity({ name: 'devices' })
export class DeviceEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  // Supprimer un compte supprime ses appareils et, en cascade, toutes leurs données.
  @ManyToOne(() => AccountEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'account_id' })
  account?: AccountEntity;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
