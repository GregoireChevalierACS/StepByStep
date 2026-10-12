import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { DeviceEntity } from './device.entity.js';

/** Période de fuseau horaire d'un appareil : enregistrée seulement quand le fuseau change. */
@Entity({ name: 'device_time_zones' })
export class DeviceTimeZoneEntity {
  @PrimaryColumn({ name: 'device_id', type: 'uuid' })
  deviceId!: string;

  @PrimaryColumn({ name: 'valid_from', type: 'timestamptz' })
  validFrom!: Date;

  // Identifiant IANA (ex. Europe/Paris), validé par le domaine (TimeZonePeriod).
  @Column({ name: 'time_zone', type: 'text' })
  timeZone!: string;

  @ManyToOne(() => DeviceEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'device_id' })
  device?: DeviceEntity;
}
