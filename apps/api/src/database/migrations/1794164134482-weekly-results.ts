import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Classements figés des semaines closes (défis terminés). Clé primaire (groupe, semaine,
 * membre) : une semaine n'est figée qu'une fois. Index sur account_id pour la cascade à la
 * suppression d'un compte. SQL généré à partir de l'entité, puis relu.
 */
export class WeeklyResults1794164134482 implements MigrationInterface {
  name = 'WeeklyResults1794164134482';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE "weekly_results" ("group_id" uuid NOT NULL, "week" text NOT NULL, "account_id" uuid NOT NULL, "rank" integer NOT NULL, "steps" integer NOT NULL, "closed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_weekly_results_steps" CHECK ("steps" >= 0), CONSTRAINT "CHK_weekly_results_rank" CHECK ("rank" >= 1), CONSTRAINT "PK_8c49578f8febfaeae216f76193d" PRIMARY KEY ("group_id", "week", "account_id"))',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_weekly_results_account_id" ON "weekly_results" ("account_id")',
    );
    await queryRunner.query(
      'ALTER TABLE "weekly_results" ADD CONSTRAINT "FK_8725f3b3da1b7870206315271da" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "weekly_results" ADD CONSTRAINT "FK_93c968cb3e84425a86e3531c4a5" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "weekly_results" DROP CONSTRAINT "FK_93c968cb3e84425a86e3531c4a5"',
    );
    await queryRunner.query(
      'ALTER TABLE "weekly_results" DROP CONSTRAINT "FK_8725f3b3da1b7870206315271da"',
    );
    await queryRunner.query('DROP INDEX "public"."IDX_weekly_results_account_id"');
    await queryRunner.query('DROP TABLE "weekly_results"');
  }
}
