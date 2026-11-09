import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import type { Environment } from './config/environment.js';
import { configureApp } from './configure-app.js';
import { AppLogger } from './observability/app-logger.js';

// Journaux du démarrage gardés en mémoire jusqu'à l'installation du journal configuré : même
// eux sortent au format choisi.
const app = configureApp(await NestFactory.create(AppModule, { bufferLogs: true }));
// Configuration déjà validée et typée par parseEnvironment : PORT est un nombre.
const config = app.get<ConfigService<Environment, true>>(ConfigService);
app.useLogger(new AppLogger(config.get('LOG_FORMAT', { infer: true })));
await app.listen(config.get('PORT', { infer: true }));
