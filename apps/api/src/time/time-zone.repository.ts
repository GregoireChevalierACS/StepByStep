import type { TimeZonePeriod } from '@stepbystep/domain';

/** Port de persistance des périodes de fuseau d'un appareil (voir DeviceRepository). */
export interface TimeZoneRepository {
  /** Périodes enregistrées, dans un ordre quelconque : TimeZoneHistory.from les ordonne. */
  periodsOf(deviceId: string): Promise<TimeZonePeriod[]>;
}

export const TIME_ZONE_REPOSITORY = Symbol('TIME_ZONE_REPOSITORY');
