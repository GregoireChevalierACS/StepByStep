import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { GroupName, IsoWeek, Nickname } from '@stepbystep/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dailyStepsOf } from '../testing/contracts/ranking-query.contract.js';
import { ANY_SECRET_HASH } from '../testing/fixtures.js';
import { InMemoryRankingQuery } from '../testing/in-memory-ranking.query.js';
import { inMemoryStores } from '../testing/in-memory-stores.js';
import { metricValue, testMetrics } from '../testing/metrics.js';
import { unwrap } from '../testing/unwrap.js';
import { ChallengeCloser } from './challenge-closer.js';

const week = (value: string) => unwrap(IsoWeek.create(value));

// Un groupe d'un membre avec des pas en semaines 44 et 45 de 2026, et une horloge réglable.
const setup = async (intervalMs = 0) => {
  const stores = inMemoryStores();
  const { accountId, deviceId } = await stores.devices.registerWithNewAccount(ANY_SECRET_HASH);
  stores.nicknames.set(accountId, unwrap(Nickname.create('Zoé')));
  const group = await stores.groups.create(
    accountId,
    unwrap(GroupName.create('Bureau')),
    randomUUID(),
  );
  stores.dailySteps.given(
    deviceId,
    dailyStepsOf([
      ['2026-10-28', 4_000],
      ['2026-11-04', 6_000],
    ]),
  );
  let now = Date.parse('2026-11-11T08:00:00Z');
  const clock = { now: () => now };
  const metrics = testMetrics(clock);
  const closer = new ChallengeCloser(
    stores.weeklyResults,
    new InMemoryRankingQuery(stores),
    clock,
    { intervalMs },
    metrics,
  );
  const frozenSteps = async (value: string) =>
    (await stores.weeklyResults.resultsOf(group.id, week(value)))?.map(({ steps }) => steps);
  return { closer, frozenSteps, metrics, stores, setNow: (iso: string) => (now = Date.parse(iso)) };
};

describe('ChallengeCloser', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('le mercredi, fige la semaine qui s’est terminée le dimanche', async () => {
    const { closer, frozenSteps } = await setup();

    const { week: closed, closed: count } = await closer.closeDueWeek();

    expect([closed.toString(), count]).toEqual(['2026-W45', 1]);
    expect(await frozenSteps('2026-W45')).toEqual([6_000]);
  });

  it('le mardi, la semaine précédente reste ouverte : c’est l’avant-dernière qui est close', async () => {
    const { closer, frozenSteps, setNow } = await setup();
    setNow('2026-11-10T23:59:00Z');

    expect((await closer.closeDueWeek()).week.toString()).toBe('2026-W44');
    expect(await frozenSteps('2026-W44')).toEqual([4_000]);
    expect(await frozenSteps('2026-W45')).toBeUndefined();
  });

  it('ne refige pas une semaine déjà close aux passages suivants', async () => {
    const { closer } = await setup();
    await closer.closeDueWeek();

    expect((await closer.closeDueWeek()).closed).toBe(0);
  });

  it('passe à intervalle régulier, puis s’arrête avec l’application', async () => {
    vi.useFakeTimers();
    const { closer, frozenSteps } = await setup(1000);

    closer.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(1000);
    expect(await frozenSteps('2026-W45')).toEqual([6_000]);

    closer.onModuleDestroy();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('mesure les groupes figés et l’heure du dernier passage réussi', async () => {
    vi.useFakeTimers();
    const { closer, metrics } = await setup(1000);

    closer.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(2000);
    closer.onModuleDestroy();

    // Deux passages : le second ne refige rien, mais il a réussi.
    expect(await metricValue(metrics, 'stepbystep_challenge_groups_closed_total')).toBe(1);
    expect(
      await metricValue(metrics, 'stepbystep_challenge_closing_last_success_timestamp_seconds'),
    ).toBe(Date.parse('2026-11-11T08:00:00Z') / 1000);
    expect(await metricValue(metrics, 'stepbystep_challenge_closing_failures_total')).toBe(0);
  });

  it('compte les passages en échec, sans heure de succès', async () => {
    vi.useFakeTimers();
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { closer, metrics, stores } = await setup(1000);
    vi.spyOn(stores.weeklyResults, 'closeWeek').mockRejectedValue(new Error('base indisponible'));

    closer.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(2000);
    closer.onModuleDestroy();

    expect(await metricValue(metrics, 'stepbystep_challenge_closing_failures_total')).toBe(2);
    expect(
      await metricValue(metrics, 'stepbystep_challenge_closing_last_success_timestamp_seconds'),
    ).toBe(0);
  });

  it('ne démarre pas quand l’intervalle vaut 0', async () => {
    vi.useFakeTimers();
    const { closer } = await setup(0);

    closer.onApplicationBootstrap();

    expect(vi.getTimerCount()).toBe(0);
  });
});
