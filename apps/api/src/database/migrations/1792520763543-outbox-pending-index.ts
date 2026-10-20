import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Index partiel des événements à publier : le relais les lit sans parcourir l'historique déjà
 * publié, qui ne fait que grossir. SQL généré à partir de l'entité, puis relu.
 */
export class OutboxPendingIndex1792520763543 implements MigrationInterface {
  name = 'OutboxPendingIndex1792520763543';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX "IDX_outbox_events_pending" ON "outbox_events" ("created_at") WHERE "published_at" IS NULL',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "public"."IDX_outbox_events_pending"');
  }
}
