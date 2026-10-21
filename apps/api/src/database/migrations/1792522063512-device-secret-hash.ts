import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Empreinte du secret de chaque appareil (authentification). Nullable : les appareils créés
 * avant n'ont pas de secret, ne peuvent pas obtenir de jeton et doivent se réenregistrer ;
 * leur en générer un ici n'aurait servi à rien, faute de canal sûr pour le leur transmettre.
 * SQL généré à partir de l'entité, puis relu.
 */
export class DeviceSecretHash1792522063512 implements MigrationInterface {
  name = 'DeviceSecretHash1792522063512';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "devices" ADD "secret_hash" text');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "devices" DROP COLUMN "secret_hash"');
  }
}
