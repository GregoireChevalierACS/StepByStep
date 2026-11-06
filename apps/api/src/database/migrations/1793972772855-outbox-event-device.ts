import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Appareil de chaque événement de l'outbox, en clé étrangère ON DELETE CASCADE : supprimer un
 * compte efface aussi ses événements, qui contiennent des données de pas (ADR 0002, décision
 * 16). Les événements GoalReached déjà écrits sont rattachés à l'appareil de leur payload avant
 * la pose de la contrainte. SQL généré à partir de l'entité, puis relu ; reprise ajoutée.
 */
export class OutboxEventDevice1793972772855 implements MigrationInterface {
  name = 'OutboxEventDevice1793972772855';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "outbox_events" ADD "device_id" uuid');
    // Jointure sur le texte plutôt qu'une conversion ::uuid : une valeur mal formée dans un
    // payload ne fait pas échouer la migration, l'événement reste simplement sans appareil.
    await queryRunner.query(
      `UPDATE "outbox_events" SET "device_id" = "devices"."id" FROM "devices" WHERE "outbox_events"."type" = 'GoalReached' AND "devices"."id"::text = "outbox_events"."payload"->>'deviceId'`,
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_outbox_events_device_id" ON "outbox_events" ("device_id")',
    );
    await queryRunner.query(
      'ALTER TABLE "outbox_events" ADD CONSTRAINT "FK_c23510c4075dccf43f3c261063d" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "outbox_events" DROP CONSTRAINT "FK_c23510c4075dccf43f3c261063d"',
    );
    await queryRunner.query('DROP INDEX "public"."IDX_outbox_events_device_id"');
    await queryRunner.query('ALTER TABLE "outbox_events" DROP COLUMN "device_id"');
  }
}
