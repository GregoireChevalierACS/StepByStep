import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AccountEntity } from '../database/entities/account.entity.js';
import { DeviceEntity } from '../database/entities/device.entity.js';

export interface RegisteredDevice {
  readonly accountId: string;
  readonly deviceId: string;
}

/**
 * Enregistrement d'un appareil. Phase 8a : pas encore d'authentification, un compte est
 * créé avec son premier appareil (ADR 0002). Les deux insertions forment une transaction :
 * jamais de compte sans appareil.
 */
@Injectable()
export class DevicesService {
  constructor(private readonly dataSource: DataSource) {}

  register(): Promise<RegisteredDevice> {
    return this.dataSource.transaction(async (manager) => {
      const account = await manager.getRepository(AccountEntity).save({});
      const device = await manager.getRepository(DeviceEntity).save({ accountId: account.id });
      return { accountId: account.id, deviceId: device.id };
    });
  }
}
