import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { configureApp } from '../configure-app.js';

type App = Parameters<typeof request>[0];

/**
 * Scénario de bout en bout de la synchronisation, à travers l'API HTTP et un vrai PostgreSQL :
 * relevés en double, dans le désordre, redémarrage du téléphone au milieu, puis voyage avec
 * changement de fuseau. Les chiffres sont choisis pour que chaque piège ait un effet visible.
 *
 * Relevés (UTC), heure locale entre parenthèses :
 *   R1 démarrage 3, 1000 pas, 05/10 06:00 (Paris 08:00)
 *   R2 démarrage 3, 3000 pas, 05/10 16:00 (Paris 18:00)  → 2000 le 05/10
 *   R3 démarrage 3, 3500 pas, 05/10 21:00 (Paris 23:00)  →  500 le 05/10
 *   R4 démarrage 3, 4100 pas, 05/10 23:00 (Paris 01:00)  →  600 de part et d'autre de minuit : 300 / 300
 *   R5 démarrage 4,  400 pas, 06/10 07:00 (Paris 09:00)  →  400 le 06/10 (redémarrage : tout est nouveau)
 *   R6 démarrage 4, 1400 pas, 06/10 12:00 (Paris 14:00)  → 1000 le 06/10
 *   — départ pour New York (UTC−4) le 06/10 à 20:00 UTC —
 *   R7 démarrage 4, 1900 pas, 06/10 21:00 (New York 17:00) →  500 le 06/10
 *   R8 démarrage 4, 2900 pas, 07/10 03:00 (New York 23:00) → 1000 le 06/10 (à Paris, minuit serait passé)
 *   R9 démarrage 4, 3900 pas, 07/10 13:00 (New York 09:00) → 1000 de part et d'autre de minuit : 100 / 900
 *
 * Attendu : 05/10 → 2800, 06/10 → 3300, 07/10 → 900 (total 7000, aucun pas perdu ni inventé).
 */
const reading = (bootCount: number, stepsSinceBoot: number, takenAt: string) => ({
  bootCount,
  stepsSinceBoot,
  takenAt,
});
const R1 = reading(3, 1000, '2026-10-05T06:00:00.000Z');
const R2 = reading(3, 3000, '2026-10-05T16:00:00.000Z');
const R3 = reading(3, 3500, '2026-10-05T21:00:00.000Z');
const R4 = reading(3, 4100, '2026-10-05T23:00:00.000Z');
const R5 = reading(4, 400, '2026-10-06T07:00:00.000Z');
const R6 = reading(4, 1400, '2026-10-06T12:00:00.000Z');
const R7 = reading(4, 1900, '2026-10-06T21:00:00.000Z');
const R8 = reading(4, 2900, '2026-10-07T03:00:00.000Z');
const R9 = reading(4, 3900, '2026-10-07T13:00:00.000Z');

const PARIS = { timeZone: 'Europe/Paris', since: '2026-10-01T00:00:00.000Z' };
const NEW_YORK = { timeZone: 'America/New_York', since: '2026-10-06T20:00:00.000Z' };

const EXPECTED_DAYS = [
  { day: '2026-10-05', steps: 2800 },
  { day: '2026-10-06', steps: 3300 },
  { day: '2026-10-07', steps: 900 },
];

describe('Synchronisation de bout en bout : doublons, désordre, redémarrage, changement de fuseau', () => {
  let app: INestApplication<App>;

  const http = () => request(app.getHttpServer());
  const newDevice = async (): Promise<string> =>
    ((await http().post('/v1/devices').expect(201)).body as { deviceId: string }).deviceId;
  const send = async (deviceId: string, body: object) =>
    (await http().post(`/v1/devices/${deviceId}/readings`).send(body).expect(200)).body as {
      accepted: number;
      duplicates: number;
    };
  const dailySteps = async (deviceId: string) =>
    (
      await http()
        .get(`/v1/devices/${deviceId}/daily-steps`)
        .query({ from: '2026-10-05', to: '2026-10-07' })
        .expect(200)
    ).body as unknown;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication<INestApplication<App>>());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('converge vers les bons totaux, lot après lot, comme les enverrait un téléphone', async () => {
    const deviceId = await newDevice();

    // Premier envoi : le fuseau de départ ; R3 manque, il arrivera en retard.
    expect(await send(deviceId, { readings: [R1, R2, R4], timeZoneChanges: [PARIS] })).toEqual(
      expect.objectContaining({ accepted: 3, duplicates: 0 }),
    );
    // Réponse perdue, le téléphone renvoie : seul le relevé du redémarrage est nouveau.
    expect(await send(deviceId, { readings: [R2, R4, R5], timeZoneChanges: [] })).toEqual(
      expect.objectContaining({ accepted: 1, duplicates: 2 }),
    );
    // R3 arrive après R4 et R5 : la journée du 05/10 est recalculée.
    expect(await send(deviceId, { readings: [R3, R6], timeZoneChanges: [] })).toEqual(
      expect.objectContaining({ accepted: 2, duplicates: 0 }),
    );
    // Arrivé à New York : le nouveau fuseau, et des relevés dans le désordre au sein du lot.
    expect(await send(deviceId, { readings: [R9, R7, R8], timeZoneChanges: [NEW_YORK] })).toEqual(
      expect.objectContaining({ accepted: 3, duplicates: 0 }),
    );

    expect(await dailySteps(deviceId)).toEqual(EXPECTED_DAYS);
  });

  it('donne le même résultat quel que soit l’ordre d’arrivée des relevés', async () => {
    const deviceId = await newDevice();
    await send(deviceId, { readings: [], timeZoneChanges: [PARIS, NEW_YORK] });

    // Un relevé par envoi, du plus récent au plus ancien, chacun reçu deux fois.
    for (const r of [R9, R8, R7, R6, R5, R4, R3, R2, R1]) {
      await send(deviceId, { readings: [r], timeZoneChanges: [] });
      await send(deviceId, { readings: [r], timeZoneChanges: [] });
    }

    expect(await dailySteps(deviceId)).toEqual(EXPECTED_DAYS);
  });
});
