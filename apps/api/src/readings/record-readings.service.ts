import { Inject, Injectable } from '@nestjs/common';
import {
  type ConflictingTimeZonePeriods,
  dailyStepsFromReadings,
  err,
  goalsReached,
  ok,
  type Result,
  type StepCounterReading,
  TimeZoneHistory,
  type TimeZonePeriod,
} from '@stepbystep/domain';
import type { DeviceNotFound, MissingTimeZone } from '../devices/device-errors.js';
import { goalReachedEvent } from '../events/outbox-event.js';
import { goalHistoryOrDefault } from '../goals/default-daily-goal.js';
import type { UnknownTimeZone } from '../time/intl-local-calendar.js';
import { TimeZoneHistoryCalendar } from '../time/time-zone-history-calendar.js';
import { recalculationWindow } from './recalculation-window.js';
import {
  type DeviceLedger,
  READINGS_UNIT_OF_WORK,
  type ReadingsUnitOfWork,
} from './readings-unit-of-work.js';

export interface RecordReadingsCommand {
  readonly deviceId: string;
  readonly readings: readonly StepCounterReading[];
  readonly timeZoneChanges: readonly TimeZonePeriod[];
}

export interface RecordReadingsReport {
  /** Relevés nouvellement enregistrés. */
  readonly accepted: number;
  /** Relevés déjà connus, ignorés (renvoi après une coupure réseau…). */
  readonly duplicates: number;
  /** Pas par jour local recalculés par ce lot. */
  readonly days: readonly { readonly day: string; readonly steps: number }[];
}

export type RecordReadingsError =
  DeviceNotFound | MissingTimeZone | ConflictingTimeZonePeriods | UnknownTimeZone;

/**
 * Cas d'usage : enregistrer un lot de relevés et de changements de fuseau, puis recalculer
 * les pas des jours touchés. Une seule unité de travail, l'appareil verrouillé : tout ou rien,
 * et jamais deux lots du même appareil en même temps. Idempotent : un relevé déjà connu est
 * ignoré, et le recalcul ne dépend que de l'ensemble des relevés (dailyStepsFromReadings).
 */
@Injectable()
export class RecordReadingsService {
  constructor(@Inject(READINGS_UNIT_OF_WORK) private readonly unitOfWork: ReadingsUnitOfWork) {}

  record(
    command: RecordReadingsCommand,
  ): Promise<Result<RecordReadingsReport, RecordReadingsError>> {
    return this.unitOfWork.withDeviceLocked(command.deviceId, (ledger) =>
      this.recordIn(ledger, command),
    );
  }

  private async recordIn(
    ledger: DeviceLedger,
    { deviceId, readings, timeZoneChanges }: RecordReadingsCommand,
  ): Promise<Result<RecordReadingsReport, Exclude<RecordReadingsError, DeviceNotFound>>> {
    // 1. Historique des fuseaux (enregistrés + nouveaux), validé par le domaine AVANT tout
    //    ajout : un fuseau contradictoire serait sinon ignoré en silence comme un doublon.
    const periods = [...(await ledger.timeZonePeriods()), ...timeZoneChanges];
    if (periods.length === 0) return err({ kind: 'MissingTimeZone', deviceId });
    const history = TimeZoneHistory.from(periods);
    if (!history.ok) {
      return err(
        history.error.kind === 'EmptyTimeZoneHistory'
          ? { kind: 'MissingTimeZone', deviceId }
          : history.error,
      );
    }
    const calendar = TimeZoneHistoryCalendar.for(history.value);
    if (!calendar.ok) return calendar;

    // 2. Ajouts idempotents : seuls les relevés et périodes nouveaux sont comptés.
    const newPeriodStarts = await ledger.addTimeZonePeriods(timeZoneChanges);
    const acceptedInstants = await ledger.addReadings(readings);
    const report = {
      accepted: acceptedInstants.length,
      duplicates: readings.length - acceptedInstants.length,
    };
    const changedInstants = [...acceptedInstants, ...newPeriodStarts];
    if (changedInstants.length === 0) return ok({ ...report, days: [] });

    // 3. Fenêtre de recalcul : du voisin précédent au voisin suivant, en journées entières.
    const previousNeighbor = await ledger.readingInstantBefore(Math.min(...changedInstants), false);
    const nextNeighbor = await ledger.readingInstantAfter(Math.max(...changedInstants), false);
    const window = recalculationWindow(
      {
        changedInstants,
        ...(previousNeighbor === undefined ? {} : { previousNeighbor }),
        ...(nextNeighbor === undefined ? {} : { nextNeighbor }),
      },
      calendar.value,
    );

    // 4. Relevés couvrant ces journées entières (plus un de chaque côté, pour les paires qui
    //    traversent minuit), recalcul par le domaine, projection des jours de la fenêtre.
    const from = (await ledger.readingInstantBefore(window.from, true)) ?? window.from;
    const to = (await ledger.readingInstantAfter(window.to, true)) ?? window.to;
    const days = dailyStepsFromReadings(
      await ledger.readingsBetween(from, to),
      calendar.value,
    ).filter(
      ({ date }) => date.compareTo(window.firstDay) >= 0 && date.compareTo(window.lastDay) <= 0,
    );
    // 5. Événements : jours qui viennent de franchir leur objectif, jugés sur les totaux
    //    d'avant ce recalcul. Écrits dans l'outbox, dans la même unité de travail que les
    //    données : publiés plus tard par le relais, jamais perdus ni inventés.
    const before = await ledger.dailyStepsBetween(window.firstDay, window.lastDay);
    await ledger.saveDailySteps(days);
    const goals = goalHistoryOrDefault(await ledger.goalChanges(), window.firstDay);
    await ledger.appendEvents(
      goalsReached(before, days, goals).map((reached) => goalReachedEvent(deviceId, reached)),
    );

    return ok({
      ...report,
      days: days.map(({ date, steps }) => ({ day: date.toString(), steps: steps.value })),
    });
  }
}
