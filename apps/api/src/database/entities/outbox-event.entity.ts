import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { DeviceEntity } from './device.entity.js';

/**
 * Outbox transactionnelle : un événement de domaine est écrit ici dans la même transaction que
 * les données qui l'ont produit, puis publié plus tard par un relais. Il existe donc si et
 * seulement si ces données existent : ni événement perdu, ni événement fantôme.
 */
@Entity({ name: 'outbox_events' })
@Unique('UQ_outbox_events_event_key', ['eventKey'])
// Index partiel : le relais ne lit que les événements à publier, sans parcourir l'historique.
@Index('IDX_outbox_events_pending', ['createdAt'], { where: '"published_at" IS NULL' })
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

  // Appareil dont les données ont produit l'événement. La clé étrangère étend l'invariant de
  // l'outbox à l'effacement : supprimer l'appareil (ou son compte) supprime ses événements, qui
  // contiennent des données de pas. NULL pour un événement qui ne concerne aucun appareil.
  // Indexé : sans index, chaque suppression d'appareil parcourrait toute l'outbox.
  @Index('IDX_outbox_events_device_id')
  @Column({ name: 'device_id', type: 'uuid', nullable: true })
  deviceId!: string | null;

  @ManyToOne(() => DeviceEntity, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'device_id' })
  device?: DeviceEntity;
}
