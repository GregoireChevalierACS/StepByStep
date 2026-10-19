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
}
