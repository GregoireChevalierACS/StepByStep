import { Controller, Get } from '@nestjs/common';

export interface HealthStatus {
  readonly status: 'ok';
}

/** Sonde de disponibilité : utilisée par la supervision et le script de démo. */
@Controller({ path: 'health', version: '1' })
export class HealthController {
  @Get()
  check(): HealthStatus {
    return { status: 'ok' };
  }
}
