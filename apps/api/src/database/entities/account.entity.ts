import { CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Compte d'un utilisateur : regroupe ses appareils et son historique d'objectifs. */
@Entity({ name: 'accounts' })
export class AccountEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
