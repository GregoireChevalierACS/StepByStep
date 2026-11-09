import type { Clock } from '@stepbystep/domain';
import { Counter, Gauge, Histogram, type Registry } from 'prom-client';

/** Requête terminée, telle que la voit le journal d'accès. */
export interface ObservedRequest {
  readonly method: string;
  /** Modèle de route (`/v1/devices/:deviceId/readings`) ; `null` pour une route inconnue. */
  readonly route: string | null;
  readonly status: number;
  readonly durationMs: number;
}

/** Valeur de l'étiquette `route` pour une URL qu'aucune route ne sert (404 de routage). */
export const UNMATCHED_ROUTE = 'unmatched';

const PREFIX = 'stepbystep_';

/**
 * Métriques de l'API au format Prometheus (ADR 0002, décision 22), dans un registre propre à
 * l'application et non le registre global de prom-client : deux applications dans un même
 * processus (les tests en démarrent plusieurs) ne se marchent pas dessus.
 *
 * Étiquettes à cardinalité bornée uniquement : le modèle de route, jamais l'URL réelle (un
 * identifiant par appareil créerait une série par appareil et ferait exploser Prometheus).
 * Les tâches de fond exposent l'heure de leur dernier passage réussi : une alerte sur
 * `time() - …_last_success_timestamp_seconds` détecte une tâche bloquée ou en échec permanent,
 * ce qu'un simple compteur d'erreurs ne voit pas (une tâche qui ne tourne plus n'échoue plus).
 */
export class Metrics {
  private readonly httpDuration: Histogram<'method' | 'route' | 'status'>;
  private readonly eventsPublished: Counter;
  private readonly relayFailures: Counter;
  private readonly relayLastSuccess: Gauge;
  private readonly groupsClosed: Counter;
  private readonly closingFailures: Counter;
  private readonly closingLastSuccess: Gauge;

  constructor(
    readonly registry: Registry,
    private readonly clock: Clock,
  ) {
    const registers = [registry];
    this.httpDuration = new Histogram({
      name: `${PREFIX}http_request_duration_seconds`,
      help: 'Durée de traitement des requêtes HTTP, par méthode, modèle de route et statut.',
      labelNames: ['method', 'route', 'status'],
      // Seuils par défaut de prom-client (5 ms à 10 s) : de la lecture simple à l'échange de
      // jeton (scrypt, volontairement lent).
      registers,
    });
    this.eventsPublished = new Counter({
      name: `${PREFIX}outbox_events_published_total`,
      help: 'Événements de l’outbox publiés par le relais.',
      registers,
    });
    this.relayFailures = new Counter({
      name: `${PREFIX}outbox_relay_failures_total`,
      help: 'Passages du relais de l’outbox interrompus par une erreur.',
      registers,
    });
    this.relayLastSuccess = new Gauge({
      name: `${PREFIX}outbox_relay_last_success_timestamp_seconds`,
      help: 'Heure (epoch, secondes) du dernier passage réussi du relais de l’outbox.',
      registers,
    });
    this.groupsClosed = new Counter({
      name: `${PREFIX}challenge_groups_closed_total`,
      help: 'Classements hebdomadaires de groupe figés par la clôture des défis.',
      registers,
    });
    this.closingFailures = new Counter({
      name: `${PREFIX}challenge_closing_failures_total`,
      help: 'Passages de la clôture des défis interrompus par une erreur.',
      registers,
    });
    this.closingLastSuccess = new Gauge({
      name: `${PREFIX}challenge_closing_last_success_timestamp_seconds`,
      help: 'Heure (epoch, secondes) du dernier passage réussi de la clôture des défis.',
      registers,
    });
  }

  requestHandled({ method, route, status, durationMs }: ObservedRequest): void {
    this.httpDuration.observe(
      { method, route: route ?? UNMATCHED_ROUTE, status: String(status) },
      durationMs / 1000,
    );
  }

  relayPassSucceeded(published: number): void {
    this.eventsPublished.inc(published);
    this.relayLastSuccess.set(this.nowInSeconds());
  }

  relayPassFailed(): void {
    this.relayFailures.inc();
  }

  /** `closed` vaut `undefined` quand une autre instance clôturait : le passage a réussi. */
  closingPassSucceeded(closed: number | undefined): void {
    this.groupsClosed.inc(closed ?? 0);
    this.closingLastSuccess.set(this.nowInSeconds());
  }

  closingPassFailed(): void {
    this.closingFailures.inc();
  }

  /** Toutes les métriques, au format texte de Prometheus. */
  exposition(): Promise<string> {
    return this.registry.metrics();
  }

  private nowInSeconds(): number {
    return this.clock.now() / 1000;
  }
}
