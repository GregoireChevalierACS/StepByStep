import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Compte d'un utilisateur : regroupe ses appareils et son historique d'objectifs. */
@Entity({ name: 'accounts' })
export class AccountEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  // Pseudo affiché aux membres de ses groupes, déjà normalisé par le domaine (Nickname).
  // NULL tant que l'utilisateur n'en a pas choisi. Pas unique : l'imposer révélerait quels
  // pseudos sont pris, et deux membres d'un même groupe se distinguent par leur identifiant.
  @Column({ name: 'nickname', type: 'text', nullable: true })
  nickname!: string | null;
}
