import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AccountRepository } from '../../accounts/account.repository.js';
import { AccountEntity } from '../entities/account.entity.js';

/** Adapter PostgreSQL (TypeORM) du port AccountRepository. */
@Injectable()
export class TypeOrmAccountRepository implements AccountRepository {
  constructor(private readonly dataSource: DataSource) {}

  exists(accountId: string): Promise<boolean> {
    return this.dataSource.getRepository(AccountEntity).existsBy({ id: accountId });
  }

  async delete(accountId: string): Promise<void> {
    // Une seule instruction, donc atomique : les clés étrangères ON DELETE CASCADE effacent
    // les appareils du compte, puis toutes leurs données, outbox comprise. Un envoi de relevés
    // en cours verrouille la ligne de son appareil (FOR UPDATE) : la suppression attend sa
    // fin, et un envoi qui arrive après trouve un appareil inconnu.
    await this.dataSource.getRepository(AccountEntity).delete({ id: accountId });
  }
}
