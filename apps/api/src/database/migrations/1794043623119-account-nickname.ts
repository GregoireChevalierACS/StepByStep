import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pseudo du compte, affiché aux membres de ses groupes (défis entre amis). Nullable : les
 * comptes existants n'en ont pas encore choisi. SQL généré à partir de l'entité, puis relu.
 */
export class AccountNickname1794043623119 implements MigrationInterface {
  name = 'AccountNickname1794043623119';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "accounts" ADD "nickname" text');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "accounts" DROP COLUMN "nickname"');
  }
}
