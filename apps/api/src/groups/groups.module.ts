import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../config/environment.js';
import {
  CHALLENGE_CLOSER_OPTIONS,
  ChallengeCloser,
  type ChallengeCloserOptions,
} from './challenge-closer.js';
import { GroupsController } from './groups.controller.js';
import { GroupsService } from './groups.service.js';

@Module({
  controllers: [GroupsController],
  providers: [
    GroupsService,
    ChallengeCloser,
    {
      provide: CHALLENGE_CLOSER_OPTIONS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Environment, true>): ChallengeCloserOptions => ({
        intervalMs: config.get('CHALLENGE_CLOSING_INTERVAL_MS', { infer: true }),
      }),
    },
  ],
})
export class GroupsModule {}
