import { Injectable } from '@nestjs/common';
import type { TimeZonePeriod } from '@stepbystep/domain';
import { DataSource } from 'typeorm';
import type { TimeZoneRepository } from '../../time/time-zone.repository.js';
import { DeviceTimeZoneEntity } from '../entities/device-time-zone.entity.js';
import { periodToDomain } from '../mappers/time-zone-period.mapper.js';
import { stored } from './stored.js';

/** Adapter PostgreSQL (TypeORM) du port TimeZoneRepository. */
@Injectable()
export class TypeOrmTimeZoneRepository implements TimeZoneRepository {
  constructor(private readonly dataSource: DataSource) {}

  async periodsOf(deviceId: string): Promise<TimeZonePeriod[]> {
    const rows = await this.dataSource.getRepository(DeviceTimeZoneEntity).findBy({ deviceId });
    return rows.map((row) => stored(periodToDomain(row)));
  }
}
