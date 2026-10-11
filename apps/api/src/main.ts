import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import type { Environment } from './config/environment.js';
import { configureApp } from './configure-app.js';

const app = configureApp(await NestFactory.create(AppModule));
// Configuration déjà validée et typée par parseEnvironment : PORT est un nombre.
const config = app.get<ConfigService<Environment, true>>(ConfigService);
await app.listen(config.get('PORT', { infer: true }));
