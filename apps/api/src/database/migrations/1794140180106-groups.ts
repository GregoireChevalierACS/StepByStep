import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Groupes d'amis (défis) et leurs membres. Les appartenances disparaissent avec le compte ou le
 * groupe (ON DELETE CASCADE) ; index sur account_id pour « mes groupes » et pour cette cascade.
 * SQL généré à partir des entités, puis relu.
 */
export class Groups1794140180106 implements MigrationInterface {
  name = 'Groups1794140180106';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE "groups" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "name" text NOT NULL, "invite_code" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_groups_invite_code" UNIQUE ("invite_code"), CONSTRAINT "PK_659d1483316afb28afd3a90646e" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE TABLE "group_members" ("group_id" uuid NOT NULL, "account_id" uuid NOT NULL, "joined_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_f3506b9e691ec799c1c806fc920" PRIMARY KEY ("group_id", "account_id"))',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_group_members_account_id" ON "group_members" ("account_id")',
    );
    await queryRunner.query(
      'ALTER TABLE "group_members" ADD CONSTRAINT "FK_2c840df5db52dc6b4a1b0b69c6e" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "group_members" ADD CONSTRAINT "FK_bd0aa85b15d50648f1bee9e2f60" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "group_members" DROP CONSTRAINT "FK_bd0aa85b15d50648f1bee9e2f60"',
    );
    await queryRunner.query(
      'ALTER TABLE "group_members" DROP CONSTRAINT "FK_2c840df5db52dc6b4a1b0b69c6e"',
    );
    await queryRunner.query('DROP INDEX "public"."IDX_group_members_account_id"');
    await queryRunner.query('DROP TABLE "group_members"');
    await queryRunner.query('DROP TABLE "groups"');
  }
}
