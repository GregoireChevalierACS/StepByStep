import { Injectable } from '@nestjs/common';
import { Nickname } from '@stepbystep/domain';
import { DataSource } from 'typeorm';
import type { AccountRepository } from '../../accounts/account.repository.js';
import { AccountEntity } from '../entities/account.entity.js';
import { deleteEmptyGroups } from './typeorm-group.repository.js';
import { stored } from './stored.js';

/** Adapter PostgreSQL (TypeORM) du port AccountRepository. */
@Injectable()
export class TypeOrmAccountRepository implements AccountRepository {
  constructor(private readonly dataSource: DataSource) {}

  exists(accountId: string): Promise<boolean> {
    return this.dataSource.getRepository(AccountEntity).existsBy({ id: accountId });
  }

  async nicknameOf(accountId: string): Promise<Nickname | undefined> {
    const account = await this.dataSource.getRepository(AccountEntity).findOneBy({ id: accountId });
    // Relu par le domaine, comme toute donnée enregistrée : une valeur corrompue n'est pas servie.
    const nickname = account?.nickname ?? undefined;
    return nickname === undefined ? undefined : stored(Nickname.create(nickname));
  }

  async setNickname(accountId: string, nickname: Nickname): Promise<void> {
    await this.dataSource
      .getRepository(AccountEntity)
      .update({ id: accountId }, { nickname: nickname.value });
  }

  async delete(accountId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      // Verrous dans un ordre fixe (compte, puis ses groupes par identifiant), comme les autres
      // opérations sur les groupes : pas d'interblocage, et un groupe vidé ne reçoit pas de
      // nouveau membre entre la suppression du compte et la sienne.
      await manager.query('SELECT id FROM accounts WHERE id = $1 FOR UPDATE', [accountId]);
      const groups: { id: string }[] = await manager.query(
        `SELECT g.id FROM groups g JOIN group_members m ON m.group_id = g.id
         WHERE m.account_id = $1 ORDER BY g.id FOR UPDATE OF g`,
        [accountId],
      );
      // Les clés étrangères ON DELETE CASCADE effacent les appareils du compte, puis toutes
      // leurs données (outbox comprise), et ses appartenances aux groupes. Un envoi de relevés
      // en cours verrouille la ligne de son appareil (FOR UPDATE) : la suppression attend sa
      // fin, et un envoi qui arrive après trouve un appareil inconnu.
      await manager.getRepository(AccountEntity).delete({ id: accountId });
      // Un groupe n'existe qu'avec au moins un membre.
      await deleteEmptyGroups(
        manager,
        groups.map(({ id }) => id),
      );
    });
  }
}
