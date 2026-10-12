import { Injectable } from '@nestjs/common';
import {
  type ConflictingTimeZonePeriods,
  dailyStepsFromReadings,
  err,
  ok,
  type Result,
  type StepCounterReading,
  TimeZoneHistory,
  type TimeZonePeriod,
} from '@stepbystep/domain';
import { DataSource, type EntityManager } from 'typeorm';
import { DailyStepsEntity } from '../database/entities/daily-steps.entity.js';
import { DeviceTimeZoneEntity } from '../database/entities/device-time-zone.entity.js';
import { StepCounterReadingEntity } from '../database/entities/step-counter-reading.entity.js';
import { dailyStepsToRow } from '../database/mappers/daily-steps.mapper.js';
import { readingToDomain, readingToRow } from '../database/mappers/step-counter-reading.mapper.js';
import { periodToDomain, periodToRow } from '../database/mappers/time-zone-period.mapper.js';
import type { UnknownTimeZone } from '../time/intl-local-calendar.js';
import { TimeZoneHistoryCalendar } from '../time/time-zone-history-calendar.js';
import { recalculationWindow } from './recalculation-window.js';

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

export interface DeviceNotFound {
  readonly kind: 'DeviceNotFound';
  readonly deviceId: string;
}

export interface MissingTimeZone {
  readonly kind: 'MissingTimeZone';
  readonly deviceId: string;
}

export type RecordReadingsError =
  DeviceNotFound | MissingTimeZone | ConflictingTimeZonePeriods | UnknownTimeZone;

// Transporte une erreur métier hors de la transaction, que TypeORM annule alors.
class Rollback extends Error {
  constructor(readonly error: RecordReadingsError) {
    super(error.kind);
  }
}

/**
 * Cas d'usage : enregistrer un lot de relevés et de changements de fuseau, puis recalculer
 * les pas des jours touchés. Une seule transaction : tout ou rien. Idempotent : un relevé
 * déjà connu est ignoré par la base (clé primaire), et le recalcul ne dépend que de
 * l'ensemble des relevés (dailyStepsFromReadings du domaine).
 */
@Injectable()
export class RecordReadingsService {
  constructor(private readonly dataSource: DataSource) {}

  async record(
    command: RecordReadingsCommand,
  ): Promise<Result<RecordReadingsReport, RecordReadingsError>> {
    try {
      return ok(await this.dataSource.transaction((manager) => this.recordIn(manager, command)));
    } catch (error) {
      if (error instanceof Rollback) return err(error.error);
      throw error;
    }
  }

  private async recordIn(
    manager: EntityManager,
    { deviceId, readings, timeZoneChanges }: RecordReadingsCommand,
  ): Promise<RecordReadingsReport> {
    // 1. Verrou sur l'appareil : deux lots du même appareil sont traités l'un après l'autre,
    //    sinon leurs recalculs se chevaucheraient (le dernier écrirait un total faux).
    const devices: unknown[] = await manager.query(
      'SELECT id FROM devices WHERE id = $1 FOR UPDATE',
      [deviceId],
    );
    if (devices.length === 0) throw new Rollback({ kind: 'DeviceNotFound', deviceId });

    // 2. Historique des fuseaux (enregistrés + nouveaux), validé par le domaine AVANT
    //    l'insertion : la clé primaire ignorerait sinon en silence un fuseau contradictoire.
    const stored = (await manager.getRepository(DeviceTimeZoneEntity).findBy({ deviceId })).map(
      (row) => this.valid(periodToDomain(row)),
    );
    const periods = [...stored, ...timeZoneChanges];
    if (periods.length === 0) throw new Rollback({ kind: 'MissingTimeZone', deviceId });
    const history = TimeZoneHistory.from(periods);
    if (!history.ok) {
      throw new Rollback(
        history.error.kind === 'EmptyTimeZoneHistory'
          ? { kind: 'MissingTimeZone', deviceId }
          : history.error,
      );
    }
    const calendar = TimeZoneHistoryCalendar.for(history.value);
    if (!calendar.ok) throw new Rollback(calendar.error);

    // 3. Insertions idempotentes : ON CONFLICT DO NOTHING, RETURNING les lignes réellement ajoutées.
    const newPeriodStarts = await this.insertIgnoringDuplicates(
      manager,
      DeviceTimeZoneEntity,
      timeZoneChanges.map((period) => periodToRow(deviceId, period)),
      'valid_from',
    );
    const acceptedInstants = await this.insertIgnoringDuplicates(
      manager,
      StepCounterReadingEntity,
      readings.map((reading) => readingToRow(deviceId, reading)),
      'taken_at',
    );
    const report = {
      accepted: acceptedInstants.length,
      duplicates: readings.length - acceptedInstants.length,
    };

    const changedInstants = [...acceptedInstants, ...newPeriodStarts];
    if (changedInstants.length === 0) return { ...report, days: [] };

    // 4. Fenêtre de recalcul : du voisin précédent au voisin suivant, en journées entières.
    const window = recalculationWindow(
      {
        changedInstants,
        ...(await this.neighbor(manager, deviceId, '<', Math.min(...changedInstants))),
        ...(await this.neighbor(manager, deviceId, '>', Math.max(...changedInstants))),
      },
      calendar.value,
    );

    // 5. Relevés couvrant ces journées entières (plus un de chaque côté), recalcul par le domaine.
    const from = (await this.boundary(manager, deviceId, '<=', window.from)) ?? window.from;
    const to = (await this.boundary(manager, deviceId, '>=', window.to)) ?? window.to;
    const rows = await manager
      .getRepository(StepCounterReadingEntity)
      .createQueryBuilder('reading')
      .where('reading.device_id = :deviceId', { deviceId })
      .andWhere('reading.taken_at BETWEEN :from AND :to', {
        from: new Date(from),
        to: new Date(to),
      })
      .getMany();
    const days = dailyStepsFromReadings(
      rows.map((row) => this.valid(readingToDomain(row))),
      calendar.value,
    ).filter(
      ({ date }) => date.compareTo(window.firstDay) >= 0 && date.compareTo(window.lastDay) <= 0,
    );

    // 6. Projection des pas par jour : insertion ou mise à jour (UPSERT).
    if (days.length > 0) {
      await manager
        .createQueryBuilder()
        .insert()
        .into(DailyStepsEntity)
        .values(days.map((daily) => dailyStepsToRow(deviceId, daily)))
        .orUpdate(['steps', 'updated_at'], ['device_id', 'day'])
        .execute();
    }

    return {
      ...report,
      days: days.map(({ date, steps }) => ({ day: date.toString(), steps: steps.value })),
    };
  }

  /** Insère en ignorant les lignes déjà présentes ; renvoie l'instant des lignes ajoutées. */
  private async insertIgnoringDuplicates(
    manager: EntityManager,
    entity: typeof DeviceTimeZoneEntity | typeof StepCounterReadingEntity,
    rows: readonly object[],
    instantColumn: 'valid_from' | 'taken_at',
  ): Promise<number[]> {
    if (rows.length === 0) return [];
    const result = await manager
      .createQueryBuilder()
      .insert()
      .into(entity)
      .values([...rows])
      .orIgnore()
      .returning(instantColumn)
      .execute();
    // `as` : TypeORM type le résultat brut en `any` ; RETURNING ne renvoie que la colonne demandée,
    // une timestamptz que le driver pg convertit en Date.
    const inserted = result.raw as Record<typeof instantColumn, Date>[];
    return inserted.map((row) => row[instantColumn].getTime());
  }

  /** Relevé enregistré juste avant (<) ou juste après (>) un instant. */
  private async neighbor(
    manager: EntityManager,
    deviceId: string,
    direction: '<' | '>',
    instant: number,
  ): Promise<{ previousNeighbor: number } | { nextNeighbor: number } | Record<string, never>> {
    const found = await this.boundary(manager, deviceId, direction, instant);
    if (found === undefined) return {};
    return direction === '<' ? { previousNeighbor: found } : { nextNeighbor: found };
  }

  /** Instant du relevé le plus proche d'un instant, dans un sens donné (bornes incluses ou non). */
  private async boundary(
    manager: EntityManager,
    deviceId: string,
    comparison: '<' | '>' | '<=' | '>=',
    instant: number,
  ): Promise<number | undefined> {
    const aggregate = comparison.startsWith('<') ? 'max' : 'min';
    const rows: { instant: Date | null }[] = await manager.query(
      `SELECT ${aggregate}(taken_at) AS instant FROM step_counter_readings
       WHERE device_id = $1 AND taken_at ${comparison} $2`,
      [deviceId, new Date(instant)],
    );
    return rows[0]?.instant?.getTime();
  }

  /** Une ligne relue invalide est une incohérence de données : erreur serveur explicite. */
  private valid<T>(result: Result<T, unknown>): T {
    if (!result.ok) {
      throw new Error(`Donnée enregistrée invalide : ${JSON.stringify(result.error)}`);
    }
    return result.value;
  }
}
