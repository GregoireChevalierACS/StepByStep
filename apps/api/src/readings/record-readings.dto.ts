import { err, ok, type Result, StepCounterReading, TimeZonePeriod } from '@stepbystep/domain';
import { z } from 'zod';
import type { ValidationIssue } from '../http/zod-validation.pipe.js';

// Limite par requête : protège le serveur des lots démesurés, et reste sous la limite de
// 100 Ko du corps JSON (environ 90 octets par relevé).
export const MAX_READINGS_PER_BATCH = 500;
const MAX_TIME_ZONE_CHANGES_PER_BATCH = 50;

// Instant ISO 8601 avec fuseau explicite (« Z » ou « +02:00 ») : lisible et sans ambiguïté.
const instant = z.iso.datetime({ offset: true });

/**
 * Corps de POST /v1/devices/:deviceId/readings. Le DTO ne vérifie que la STRUCTURE (400) ;
 * les règles métier (pas positifs, entiers…) restent dans le domaine (422) : pas de
 * duplication des règles.
 */
export const recordReadingsBody = z.object({
  readings: z
    .array(z.object({ stepsSinceBoot: z.number(), bootCount: z.number(), takenAt: instant }))
    .max(MAX_READINGS_PER_BATCH),
  timeZoneChanges: z
    .array(z.object({ timeZone: z.string(), since: instant }))
    .max(MAX_TIME_ZONE_CHANGES_PER_BATCH)
    .default([]),
});

export type RecordReadingsBody = z.infer<typeof recordReadingsBody>;

export const deviceIdParam = z.uuid();

export interface RecordReadingsInput {
  readonly readings: readonly StepCounterReading[];
  readonly timeZoneChanges: readonly TimeZonePeriod[];
}

/**
 * DTO → objets du domaine, via leurs fabriques. Toutes les valeurs refusées sont listées,
 * avec le chemin de l'élément fautif (ex. readings.3).
 */
export const toDomain = (
  body: RecordReadingsBody,
): Result<RecordReadingsInput, ValidationIssue[]> => {
  const issues: ValidationIssue[] = [];
  const readings: StepCounterReading[] = [];
  const timeZoneChanges: TimeZonePeriod[] = [];

  body.readings.forEach((reading, index) => {
    const created = StepCounterReading.create({ ...reading, takenAt: Date.parse(reading.takenAt) });
    if (created.ok) readings.push(created.value);
    else issues.push({ path: `readings.${String(index)}`, message: created.error.kind });
  });
  body.timeZoneChanges.forEach((change, index) => {
    const created = TimeZonePeriod.create({
      timeZone: change.timeZone,
      since: Date.parse(change.since),
    });
    if (created.ok) timeZoneChanges.push(created.value);
    else issues.push({ path: `timeZoneChanges.${String(index)}`, message: created.error.kind });
  });

  return issues.length > 0 ? err(issues) : ok({ readings, timeZoneChanges });
};
