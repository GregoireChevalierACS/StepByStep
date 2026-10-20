import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Outbox transactionnelle (ADR 0002) : événements de domaine écrits dans la même transaction
 * que les données qui les produisent, publiés ensuite par un relais. La clé métier unique
 * garantit qu'un même événement n'est enregistré qu'une fois. SQL généré à partir de
 * l'entité, puis relu.
 */
export class OutboxEvents1792520157801 implements MigrationInterface {
  name = 'OutboxEvents1792520157801';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE "outbox_events" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "event_key" text NOT NULL, "type" text NOT NULL, "payload" jsonb NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "published_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_outbox_events_event_key" UNIQUE ("event_key"), CONSTRAINT "PK_6689a16c00d09b8089f6237f1d2" PRIMARY KEY ("id"))',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "outbox_events"');
  }
}
