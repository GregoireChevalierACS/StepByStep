import { type Result, TimeZonePeriod, type TimeZonePeriodError } from '@stepbystep/domain';
import type { DeviceTimeZoneEntity } from '../entities/device-time-zone.entity.js';

export type DeviceTimeZoneRow = Pick<DeviceTimeZoneEntity, 'deviceId' | 'validFrom' | 'timeZone'>;

/** Domaine → base : l'instant de début (ms) devient une Date (colonne timestamptz). */
export const periodToRow = (deviceId: string, period: TimeZonePeriod): DeviceTimeZoneRow => ({
  deviceId,
  validFrom: new Date(period.since),
  timeZone: period.timeZone,
});

/** Base → domaine : repasse par la fabrique du domaine, qui revalide la ligne lue. */
export const periodToDomain = (
  row: DeviceTimeZoneRow,
): Result<TimeZonePeriod, TimeZonePeriodError> =>
  TimeZonePeriod.create({ timeZone: row.timeZone, since: row.validFrom.getTime() });
