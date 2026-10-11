import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { DeviceEntity } from './device.entity.js';

/**
 * Relevé brut du compteur de pas, en ajout seul. La clé primaire est l'identité du relevé
 * (appareil, instant, démarrage) : un relevé renvoyé entre en conflit et n'est enregistré
 * qu'une fois (ADR 0002). L'ordre des colonnes sert aussi la recherche par appareil et
 * par plage d'instants.
 */
@Entity({ name: 'step_counter_readings' })
@Check('CHK_step_counter_readings_boot_count', '"boot_count" >= 0')
@Check('CHK_step_counter_readings_steps_since_boot', '"steps_since_boot" >= 0')
export class StepCounterReadingEntity {
  @PrimaryColumn({ name: 'device_id', type: 'uuid' })
  deviceId!: string;

  @PrimaryColumn({ name: 'taken_at', type: 'timestamptz' })
  takenAt!: Date;

  @PrimaryColumn({ name: 'boot_count', type: 'integer' })
  bootCount!: number;

  @Column({ name: 'steps_since_boot', type: 'integer' })
  stepsSinceBoot!: number;

  @CreateDateColumn({ name: 'received_at', type: 'timestamptz' })
  receivedAt!: Date;

  @ManyToOne(() => DeviceEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'device_id' })
  device?: DeviceEntity;
}
