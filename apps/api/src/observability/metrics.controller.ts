import { createHash, timingSafeEqual } from 'node:crypto';
import {
  Controller,
  Get,
  Header,
  Headers,
  Inject,
  NotFoundException,
  Res,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Registry } from 'prom-client';
import { unauthenticatedException } from '../auth/auth-errors.js';
import { Metrics } from './metrics.js';

export interface MetricsOptions {
  /** Jeton attendu de Prometheus ; sans jeton, l'endpoint n'existe pas. */
  readonly token: string | undefined;
}

export const METRICS_OPTIONS = Symbol('METRICS_OPTIONS');

interface HttpResponse {
  setHeader(name: string, value: string): unknown;
}

const BEARER = /^Bearer (\S+)$/;

// Empreintes de même longueur : timingSafeEqual exige deux tampons de même taille, et la
// comparaison ne révèle ainsi ni le contenu ni la longueur du jeton attendu.
const digest = (value: string) => createHash('sha256').update(value).digest();

/**
 * Exposition des métriques pour Prometheus (ADR 0002, décision 22). Hors du contrat de l'app
 * mobile : ni versionnée (`/metrics`, l'adresse que Prometheus attend par convention), ni
 * documentée dans OpenAPI. Elle révèle le trafic et l'état interne de l'API : désactivée tant
 * qu'aucun jeton n'est configuré (404, comme une route qui n'existe pas), puis réservée au
 * porteur de ce jeton (`Authorization: Bearer …`, que Prometheus sait envoyer).
 */
@ApiExcludeController()
@Controller({ path: 'metrics', version: VERSION_NEUTRAL })
export class MetricsController {
  private readonly expectedDigest: Buffer | undefined;

  constructor(
    private readonly metrics: Metrics,
    @Inject(METRICS_OPTIONS) options: MetricsOptions,
  ) {
    this.expectedDigest = options.token === undefined ? undefined : digest(options.token);
  }

  @Get()
  @Header('Content-Type', Registry.PROMETHEUS_CONTENT_TYPE)
  expose(
    @Headers('authorization') authorization: string | undefined,
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<string> {
    if (this.expectedDigest === undefined) throw new NotFoundException('Cannot GET /metrics');
    const token = authorization === undefined ? undefined : BEARER.exec(authorization)?.[1];
    if (token === undefined || !timingSafeEqual(digest(token), this.expectedDigest)) {
      response.setHeader('WWW-Authenticate', 'Bearer');
      throw unauthenticatedException(
        'Jeton de supervision attendu : Authorization: Bearer <jeton>.',
      );
    }
    return this.metrics.exposition();
  }
}
