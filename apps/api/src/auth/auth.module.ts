import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Clock } from '@stepbystep/domain';
import { CLOCK } from '../clock/clock.js';
import type { Environment } from '../config/environment.js';
import { DeviceAuthGuard } from './device-auth.guard.js';
import { DeviceTokens } from './device-tokens.js';

/** Jetons d'appareil (clé issue de la configuration validée) et garde des routes protégées. */
@Global()
@Module({
  providers: [
    {
      provide: DeviceTokens,
      inject: [ConfigService, CLOCK],
      useFactory: (config: ConfigService<Environment, true>, clock: Clock) =>
        new DeviceTokens(config.get('JWT_SECRET', { infer: true }), clock),
    },
    DeviceAuthGuard,
  ],
  exports: [DeviceTokens, DeviceAuthGuard],
})
export class AuthModule {}
