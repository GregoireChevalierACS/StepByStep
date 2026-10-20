import { Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import type { Outbox, PendingEvent } from '../../events/outbox.js';
import { OutboxEventEntity } from '../entities/outbox-event.entity.js';

// Contenu relu en jsonb : on revalide sa forme, comme toute donnée qui sort de la base.
const payloadOf = ({ eventKey, payload }: OutboxEventEntity): PendingEvent['payload'] => {
  const valid: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(payload)) {
    if (typeof value !== 'string' && typeof value !== 'number') {
      throw new Error(`Contenu d'événement invalide en base : ${eventKey}`);
    }
    valid[name] = value;
  }
  return valid;
};

/**
 * Adapter PostgreSQL du port Outbox. Une transaction par lot : SELECT … FOR UPDATE SKIP LOCKED
 * réserve les événements (un autre relais saute les lignes verrouillées au lieu de les
 * attendre), la publication a lieu pendant la réservation, puis le lot est marqué publié et la
 * transaction validée. Si la publication échoue, la transaction est annulée : le lot redevient
 * disponible pour le passage suivant.
 */
@Injectable()
export class TypeOrmOutbox implements Outbox {
  constructor(private readonly dataSource: DataSource) {}

  publishPending(
    limit: number,
    publish: (events: readonly PendingEvent[]) => Promise<void>,
  ): Promise<number> {
    return this.dataSource.transaction(async (manager) => {
      const rows = await manager
        .getRepository(OutboxEventEntity)
        .createQueryBuilder('event')
        .where('event.published_at IS NULL')
        .orderBy('event.created_at', 'ASC')
        .addOrderBy('event.id', 'ASC')
        .limit(limit)
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getMany();
      if (rows.length === 0) return 0;

      await publish(
        rows.map((row) => ({
          id: row.id,
          key: row.eventKey,
          type: row.type,
          payload: payloadOf(row),
        })),
      );
      await manager
        .getRepository(OutboxEventEntity)
        .update({ id: In(rows.map(({ id }) => id)) }, { publishedAt: () => 'now()' });
      return rows.length;
    });
  }
}
