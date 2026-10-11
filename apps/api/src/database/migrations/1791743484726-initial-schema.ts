import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Schéma initial (ADR 0002) : comptes, appareils, relevés bruts (clé primaire = identité
 * du relevé, pour l'idempotence), périodes de fuseau, historique d'objectifs et projection
 * des pas par jour. SQL généré à partir des entités, puis relu.
 */
export class InitialSchema1791743484726 implements MigrationInterface {
  name = 'InitialSchema1791743484726';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE "accounts" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_5a7a02c20412299d198e097a8fe" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE TABLE "daily_goals" ("account_id" uuid NOT NULL, "effective_from" date NOT NULL, "goal_steps" integer NOT NULL, CONSTRAINT "CHK_daily_goals_goal_steps" CHECK ("goal_steps" > 0), CONSTRAINT "PK_6acff9a80dc7737020cb7085dac" PRIMARY KEY ("account_id", "effective_from"))',
    );
    await queryRunner.query(
      'CREATE TABLE "devices" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "account_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b1514758245c12daf43486dd1f0" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_e7aa725032eeed6eab997fff7e" ON "devices" ("account_id")',
    );
    await queryRunner.query(
      'CREATE TABLE "daily_steps" ("device_id" uuid NOT NULL, "day" date NOT NULL, "steps" integer NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_daily_steps_steps" CHECK ("steps" >= 0), CONSTRAINT "PK_a5bf5b302114434bf76504e06e0" PRIMARY KEY ("device_id", "day"))',
    );
    await queryRunner.query(
      'CREATE TABLE "device_time_zones" ("device_id" uuid NOT NULL, "valid_from" TIMESTAMP WITH TIME ZONE NOT NULL, "time_zone" text NOT NULL, CONSTRAINT "PK_efb2fd122b614d281c2d3190345" PRIMARY KEY ("device_id", "valid_from"))',
    );
    await queryRunner.query(
      'CREATE TABLE "step_counter_readings" ("device_id" uuid NOT NULL, "taken_at" TIMESTAMP WITH TIME ZONE NOT NULL, "boot_count" integer NOT NULL, "steps_since_boot" integer NOT NULL, "received_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_step_counter_readings_steps_since_boot" CHECK ("steps_since_boot" >= 0), CONSTRAINT "CHK_step_counter_readings_boot_count" CHECK ("boot_count" >= 0), CONSTRAINT "PK_2aa4b3d4064c426c2f14b1c4305" PRIMARY KEY ("device_id", "taken_at", "boot_count"))',
    );
    await queryRunner.query(
      'ALTER TABLE "daily_goals" ADD CONSTRAINT "FK_fb35dcb01c33e999eed9e6fb2b7" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "devices" ADD CONSTRAINT "FK_e7aa725032eeed6eab997fff7e7" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "daily_steps" ADD CONSTRAINT "FK_3a64b6728999781ce74d26e2883" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "device_time_zones" ADD CONSTRAINT "FK_048cb2f55e81168f92d48153821" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "step_counter_readings" ADD CONSTRAINT "FK_e09ad06a213f7208597472c6712" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "step_counter_readings" DROP CONSTRAINT "FK_e09ad06a213f7208597472c6712"',
    );
    await queryRunner.query(
      'ALTER TABLE "device_time_zones" DROP CONSTRAINT "FK_048cb2f55e81168f92d48153821"',
    );
    await queryRunner.query(
      'ALTER TABLE "daily_steps" DROP CONSTRAINT "FK_3a64b6728999781ce74d26e2883"',
    );
    await queryRunner.query(
      'ALTER TABLE "devices" DROP CONSTRAINT "FK_e7aa725032eeed6eab997fff7e7"',
    );
    await queryRunner.query(
      'ALTER TABLE "daily_goals" DROP CONSTRAINT "FK_fb35dcb01c33e999eed9e6fb2b7"',
    );
    await queryRunner.query('DROP TABLE "step_counter_readings"');
    await queryRunner.query('DROP TABLE "device_time_zones"');
    await queryRunner.query('DROP TABLE "daily_steps"');
    await queryRunner.query('DROP INDEX "public"."IDX_e7aa725032eeed6eab997fff7e"');
    await queryRunner.query('DROP TABLE "devices"');
    await queryRunner.query('DROP TABLE "daily_goals"');
    await queryRunner.query('DROP TABLE "accounts"');
  }
}
