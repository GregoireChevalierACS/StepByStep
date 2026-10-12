// Les décorateurs TypeORM lisent les métadonnées de type : polyfill chargé avant tout.
import 'reflect-metadata';
import { inject } from 'vitest';

// Exécuté avant chaque fichier de test, avant ses imports : la configuration de l'API
// (validée au chargement de AppModule) voit ainsi l'URL de la base de test.
process.env['DATABASE_URL'] = inject('databaseUrl');
