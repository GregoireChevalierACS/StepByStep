import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DeviceEntity } from './device.entity.js';

/**
 * Pas par jour local et par appareil. Projection recalculée à partir des relevés
 * (dailyStepsFromReadings du domaine), jamais saisie directement.
 */
@Entity({ name: 'daily_steps' })
@Check('CHK_daily_steps_steps', '"steps" >= 0')
export class DailyStepsEntity {
  @PrimaryColumn({ name: 'device_id', type: 'uuid' })
  deviceId!: string;

  // Jour local, au format AAAA-MM-JJ (pas d'heure ni de fuseau).
  @PrimaryColumn({ name: 'day', type: 'date' })
  day!: string;

  @Column({ name: 'steps', type: 'integer' })
  steps!: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => DeviceEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'device_id' })
  device?: DeviceEntity;
}
