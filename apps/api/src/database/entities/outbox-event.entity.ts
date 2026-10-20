import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

/**
 * Outbox transactionnelle : un événement de domaine est écrit ici dans la même transaction que
 * les données qui l'ont produit, puis publié plus tard par un relais. Il existe donc si et
 * seulement si ces données existent : ni événement perdu, ni événement fantôme.
 */
@Entity({ name: 'outbox_events' })
@Unique('UQ_outbox_events_event_key', ['eventKey'])
export class OutboxEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Identité métier de l'événement (ex. goal-reached:<appareil>:<jour>) : un recalcul ou un
  // renvoi qui le produirait à nouveau est ignoré (ON CONFLICT DO NOTHING).
  @Column({ name: 'event_key', type: 'text' })
  eventKey!: string;

  @Column({ name: 'type', type: 'text' })
  type!: string;

  @Column({ name: 'payload', type: 'jsonb' })
  payload!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  // Renseigné par le relais une fois l'événement publié ; NULL tant qu'il reste à publier.
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;
}
