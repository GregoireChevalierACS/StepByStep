import { Global, Module } from '@nestjs/common';
import { CLOCK, systemClock } from './clock.js';

/**
 * Le port Clock du domaine : horloge système en production, remplaçable dans les tests
 * (overrideProvider). Global : la série et les jetons d'appareil en dépendent.
 */
@Global()
@Module({
  providers: [{ provide: CLOCK, useValue: systemClock }],
  exports: [CLOCK],
})
export class ClockModule {}
