import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { DeviceRepository, RegisteredDevice } from '../../devices/device.repository.js';
import { AccountEntity } from '../entities/account.entity.js';
import { DeviceEntity } from '../entities/device.entity.js';

/** Adapter PostgreSQL (TypeORM) du port DeviceRepository. */
@Injectable()
export class TypeOrmDeviceRepository implements DeviceRepository {
  constructor(private readonly dataSource: DataSource) {}

  registerWithNewAccount(): Promise<RegisteredDevice> {
    // Les deux insertions forment une transaction : jamais de compte sans appareil.
    return this.dataSource.transaction(async (manager) => {
      const account = await manager.getRepository(AccountEntity).save({});
      const device = await manager.getRepository(DeviceEntity).save({ accountId: account.id });
      return { accountId: account.id, deviceId: device.id };
    });
  }

  exists(deviceId: string): Promise<boolean> {
    return this.dataSource.getRepository(DeviceEntity).existsBy({ id: deviceId });
  }

  async accountOf(deviceId: string): Promise<string | undefined> {
    const device = await this.dataSource.getRepository(DeviceEntity).findOneBy({ id: deviceId });
    return device?.accountId;
  }
}
