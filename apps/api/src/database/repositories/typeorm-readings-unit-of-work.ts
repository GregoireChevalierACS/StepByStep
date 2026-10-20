import { Injectable } from '@nestjs/common';
import {
  type DailySteps,
  err,
  type GoalChange,
  type LocalDate,
  type Result,
  type StepCounterReading,
  type TimeZonePeriod,
} from '@stepbystep/domain';
import { Between, DataSource, type EntityManager } from 'typeorm';
import type { DeviceNotFound } from '../../devices/device-errors.js';
import type { OutboxEvent } from '../../events/outbox-event.js';
import type { DeviceLedger, ReadingsUnitOfWork } from '../../readings/readings-unit-of-work.js';
import { DailyGoalEntity } from '../entities/daily-goal.entity.js';
import { DailyStepsEntity } from '../entities/daily-steps.entity.js';
import { DeviceTimeZoneEntity } from '../entities/device-time-zone.entity.js';
import { DeviceEntity } from '../entities/device.entity.js';
import { OutboxEventEntity } from '../entities/outbox-event.entity.js';
import { StepCounterReadingEntity } from '../entities/step-counter-reading.entity.js';
import { dailyStepsToDomain, dailyStepsToRow } from '../mappers/daily-steps.mapper.js';
import { goalChangeToDomain } from '../mappers/goal-change.mapper.js';
import { readingToDomain, readingToRow } from '../mappers/step-counter-reading.mapper.js';
import { periodToDomain, periodToRow } from '../mappers/time-zone-period.mapper.js';
import { stored } from './stored.js';

/**
 * Adapter PostgreSQL du port ReadingsUnitOfWork : une transaction, et un verrou de ligne sur
 * l'appareil (SELECT … FOR UPDATE). Deux lots du même appareil sont ainsi traités l'un après
 * l'autre, sinon leurs recalculs se chevaucheraient (le dernier écrirait un total faux) ; les
 * autres appareils ne sont pas bloqués. Le verrou vit dans PostgreSQL : il vaut aussi entre
 * plusieurs instances de l'API.
 */
@Injectable()
export class TypeOrmReadingsUnitOfWork implements ReadingsUnitOfWork {
  constructor(private readonly dataSource: DataSource) {}

  async withDeviceLocked<T, E>(
    deviceId: string,
    work: (ledger: DeviceLedger) => Promise<Result<T, E>>,
  ): Promise<Result<T, E | DeviceNotFound>> {
    // TypeORM n'annule une transaction que sur exception : un échec métier est gardé ici, et
    // une exception propre à cet appel déclenche l'annulation sans être confondue avec une autre.
    let failure: Result<never, E | DeviceNotFound> | undefined;
    const rollback = new Error('Annulation de l’unité de travail');
    try {
      return await this.dataSource.transaction(async (manager) => {
        const devices: unknown[] = await manager.query(
          'SELECT id FROM devices WHERE id = $1 FOR UPDATE',
          [deviceId],
        );
        const result =
          devices.length === 0
            ? err({ kind: 'DeviceNotFound' as const, deviceId })
            : await work(new TypeOrmDeviceLedger(manager, deviceId));
        if (result.ok) return result;
        failure = result;
        throw rollback;
      });
    } catch (error) {
      if (error === rollback && failure !== undefined) return failure;
      throw error;
    }
  }
}

/** Opérations sur un appareil, toutes dans la transaction de l'unité de travail. */
class TypeOrmDeviceLedger implements DeviceLedger {
  constructor(
    private readonly manager: EntityManager,
    private readonly deviceId: string,
  ) {}

  async timeZonePeriods(): Promise<TimeZonePeriod[]> {
    const rows = await this.manager
      .getRepository(DeviceTimeZoneEntity)
      .findBy({ deviceId: this.deviceId });
    return rows.map((row) => stored(periodToDomain(row)));
  }

  addTimeZonePeriods(periods: readonly TimeZonePeriod[]): Promise<number[]> {
    return this.insertIgnoringDuplicates(
      DeviceTimeZoneEntity,
      periods.map((period) => periodToRow(this.deviceId, period)),
      'valid_from',
    );
  }

  addReadings(readings: readonly StepCounterReading[]): Promise<number[]> {
    return this.insertIgnoringDuplicates(
      StepCounterReadingEntity,
      readings.map((reading) => readingToRow(this.deviceId, reading)),
      'taken_at',
    );
  }

  readingInstantBefore(instant: number, inclusive: boolean): Promise<number | undefined> {
    return this.boundary(inclusive ? '<=' : '<', instant);
  }

  readingInstantAfter(instant: number, inclusive: boolean): Promise<number | undefined> {
    return this.boundary(inclusive ? '>=' : '>', instant);
  }

  async readingsBetween(from: number, to: number): Promise<StepCounterReading[]> {
    const rows = await this.manager
      .getRepository(StepCounterReadingEntity)
      .createQueryBuilder('reading')
      .where('reading.device_id = :deviceId', { deviceId: this.deviceId })
      .andWhere('reading.taken_at BETWEEN :from AND :to', {
        from: new Date(from),
        to: new Date(to),
      })
      .getMany();
    return rows.map((row) => stored(readingToDomain(row)));
  }

  async dailyStepsBetween(from: LocalDate, to: LocalDate): Promise<DailySteps[]> {
    const rows = await this.manager.getRepository(DailyStepsEntity).find({
      where: { deviceId: this.deviceId, day: Between(from.toString(), to.toString()) },
      order: { day: 'ASC' },
    });
    return rows.map((row) => stored(dailyStepsToDomain(row)));
  }

  async saveDailySteps(days: readonly DailySteps[]): Promise<void> {
    if (days.length === 0) return;
    // UPSERT : un jour déjà calculé reçoit son nouveau total.
    await this.manager
      .createQueryBuilder()
      .insert()
      .into(DailyStepsEntity)
      .values(days.map((daily) => dailyStepsToRow(this.deviceId, daily)))
      .orUpdate(['steps', 'updated_at'], ['device_id', 'day'])
      .execute();
  }

  async goalChanges(): Promise<GoalChange[]> {
    // L'appareil existe : le verrou de l'unité de travail vient d'être posé sur sa ligne.
    const { accountId } = await this.manager
      .getRepository(DeviceEntity)
      .findOneByOrFail({ id: this.deviceId });
    const rows = await this.manager.getRepository(DailyGoalEntity).findBy({ accountId });
    return rows.map((row) => stored(goalChangeToDomain(row)));
  }

  async appendEvents(events: readonly OutboxEvent[]): Promise<void> {
    if (events.length === 0) return;
    // ON CONFLICT DO NOTHING sur la clé métier : un événement déjà enregistré est ignoré.
    await this.manager
      .createQueryBuilder()
      .insert()
      .into(OutboxEventEntity)
      .values(
        events.map(({ key, type, payload }) => ({ eventKey: key, type, payload: { ...payload } })),
      )
      .orIgnore()
      .execute();
  }

  /** Insère en ignorant les lignes déjà présentes ; renvoie l'instant des lignes ajoutées. */
  private async insertIgnoringDuplicates(
    entity: typeof DeviceTimeZoneEntity | typeof StepCounterReadingEntity,
    rows: readonly object[],
    instantColumn: 'valid_from' | 'taken_at',
  ): Promise<number[]> {
    if (rows.length === 0) return [];
    const result = await this.manager
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

  /** Instant du relevé le plus proche d'un instant, dans un sens donné. */
  private async boundary(
    comparison: '<' | '>' | '<=' | '>=',
    instant: number,
  ): Promise<number | undefined> {
    const aggregate = comparison.startsWith('<') ? 'max' : 'min';
    const rows: { instant: Date | null }[] = await this.manager.query(
      `SELECT ${aggregate}(taken_at) AS instant FROM step_counter_readings
       WHERE device_id = $1 AND taken_at ${comparison} $2`,
      [this.deviceId, new Date(instant)],
    );
    return rows[0]?.instant?.getTime();
  }
}
