import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { EVENT_PUBLISHER, type EventPublisher } from './event-publisher.js';
import { OUTBOX, type Outbox } from './outbox.js';

export interface OutboxRelayOptions {
  /** Intervalle entre deux passages ; 0 désactive le relais. */
  readonly intervalMs: number;
  /** Nombre maximal d'événements réservés et publiés en une fois. */
  readonly batchSize: number;
}

export const OUTBOX_RELAY_OPTIONS = Symbol('OUTBOX_RELAY_OPTIONS');

/**
 * Relais de l'outbox : publie à intervalle régulier les événements écrits par les cas d'usage.
 * Un seul passage à la fois dans un processus ; entre plusieurs instances de l'API, c'est
 * l'outbox qui garantit qu'un événement n'est donné qu'à un relais (SKIP LOCKED). Un échec
 * de publication est journalisé : les événements restent en attente pour le passage suivant.
 */
@Injectable()
export class OutboxRelay implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelay.name);
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;

  constructor(
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
    @Inject(OUTBOX_RELAY_OPTIONS) private readonly options: OutboxRelayOptions,
  ) {}

  /** Publie tous les événements en attente, par lots ; renvoie le nombre publié. */
  async drain(): Promise<number> {
    let total = 0;
    for (;;) {
      const published = await this.outbox.publishPending(this.options.batchSize, (events) =>
        this.publisher.publish(events),
      );
      total += published;
      if (published < this.options.batchSize) return total;
    }
  }

  onApplicationBootstrap(): void {
    if (this.options.intervalMs <= 0) return;
    this.timer = setInterval(() => void this.tick(), this.options.intervalMs);
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  private async tick(): Promise<void> {
    // Un passage lent (gros arriéré, broker qui répond mal) ne doit pas en lancer un second.
    if (this.running) return;
    this.running = true;
    try {
      await this.drain();
    } catch (error) {
      this.logger.error(
        `Publication des événements interrompue, nouvel essai au prochain passage : ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.running = false;
    }
  }
}
