import type { OutboxEvent } from './outbox-event.js';

/** Événement de l'outbox en attente de publication. */
export interface PendingEvent extends OutboxEvent {
  readonly id: string;
}

/**
 * Port de lecture de l'outbox par le relais. Garantie « au moins une fois » : un événement
 * n'est marqué publié qu'après une publication réussie ; après un échec, il sera republié.
 * Les consommateurs s'appuient sur la clé de l'événement pour ignorer un doublon.
 */
export interface Outbox {
  /**
   * Réserve jusqu'à `limit` événements non publiés, les plus anciens d'abord, et les passe à
   * `publish`. Un événement réservé est invisible des autres relais (plusieurs instances de
   * l'API peuvent tourner). Si `publish` réussit, ils sont marqués publiés ; s'il lève une
   * exception, ils restent à publier et l'exception est propagée. Renvoie le nombre publié.
   */
  publishPending(
    limit: number,
    publish: (events: readonly PendingEvent[]) => Promise<void>,
  ): Promise<number>;
}

export const OUTBOX = Symbol('OUTBOX');
