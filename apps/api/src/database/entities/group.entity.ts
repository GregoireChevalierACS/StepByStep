import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

/** Groupe d'amis (défis) : il n'existe qu'avec au moins un membre (voir GroupRepository). */
@Entity({ name: 'groups' })
@Unique('UQ_groups_invite_code', ['inviteCode'])
export class GroupEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Déjà normalisé par le domaine (GroupName).
  @Column({ name: 'name', type: 'text' })
  name!: string;

  // Code d'invitation aléatoire (128 bits) : le connaître suffit pour rejoindre le groupe.
  @Column({ name: 'invite_code', type: 'text' })
  inviteCode!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
