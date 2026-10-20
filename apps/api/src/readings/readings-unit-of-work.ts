import type {
  DailySteps,
  GoalChange,
  LocalDate,
  Result,
  StepCounterReading,
  TimeZonePeriod,
} from '@stepbystep/domain';
import type { DeviceNotFound } from '../devices/device-errors.js';
import type { OutboxEvent } from '../events/outbox-event.js';

/**
 * Opérations sur les données d'un appareil, disponibles pendant une unité de travail : toutes
 * appartiennent à la même transaction, et aucun autre envoi du même appareil ne s'intercale.
 */
export interface DeviceLedger {
  timeZonePeriods(): Promise<TimeZonePeriod[]>;
  /** Ajoute les périodes ; renvoie le début de celles réellement ajoutées (déjà connues ignorées). */
  addTimeZonePeriods(periods: readonly TimeZonePeriod[]): Promise<number[]>;
  /** Ajoute les relevés ; renvoie l'instant de ceux réellement ajoutés (doublons ignorés). */
  addReadings(readings: readonly StepCounterReading[]): Promise<number[]>;
  /** Instant du dernier relevé avant `instant` (ou à cet instant si `inclusive`). */
  readingInstantBefore(instant: number, inclusive: boolean): Promise<number | undefined>;
  /** Instant du premier relevé après `instant` (ou à cet instant si `inclusive`). */
  readingInstantAfter(instant: number, inclusive: boolean): Promise<number | undefined>;
  /** Relevés pris entre `from` et `to`, bornes incluses, dans un ordre quelconque. */
  readingsBetween(from: number, to: number): Promise<StepCounterReading[]>;
  /** Totaux déjà enregistrés des jours de `from` à `to` (bornes incluses), triés par jour. */
  dailyStepsBetween(from: LocalDate, to: LocalDate): Promise<DailySteps[]>;
  /** Enregistre les pas de ces jours, en remplaçant les totaux déjà connus. */
  saveDailySteps(days: readonly DailySteps[]): Promise<void>;
  /** Changements d'objectif du compte de l'appareil, dans un ordre quelconque. */
  goalChanges(): Promise<GoalChange[]>;
  /**
   * Écrit des événements dans l'outbox, dans la même transaction que le reste du travail :
   * annulés avec lui. Un événement dont la clé est déjà connue est ignoré.
   */
  appendEvents(events: readonly OutboxEvent[]): Promise<void>;
}

/**
 * Port d'unité de travail de l'envoi des relevés. Le cas d'usage exprime son besoin (« ces
 * opérations, atomiquement, sans concurrence sur cet appareil ») ; l'adapter décide comment
 * (transaction et verrou de ligne pour PostgreSQL).
 */
export interface ReadingsUnitOfWork {
  /**
   * Exécute `work` avec l'appareil verrouillé. Si `work` renvoie `ok`, tout est validé ; s'il
   * renvoie `err`, ou lève une exception, rien n'est conservé. `DeviceNotFound` si l'appareil
   * n'existe pas (`work` n'est alors pas exécuté).
   */
  withDeviceLocked<T, E>(
    deviceId: string,
    work: (ledger: DeviceLedger) => Promise<Result<T, E>>,
  ): Promise<Result<T, E | DeviceNotFound>>;
}

export const READINGS_UNIT_OF_WORK = Symbol('READINGS_UNIT_OF_WORK');
