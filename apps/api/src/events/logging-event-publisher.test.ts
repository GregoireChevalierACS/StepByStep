import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoggingEventPublisher } from './logging-event-publisher.js';

describe('LoggingEventPublisher', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('journalise chaque événement publié, avec son type et sa clé', async () => {
    const logged = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    await new LoggingEventPublisher().publish([
      { key: 'goal-reached:d1:2026-10-12', type: 'GoalReached', payload: {} },
      { key: 'goal-reached:d1:2026-10-13', type: 'GoalReached', payload: {} },
    ]);

    expect(logged.mock.calls).toEqual([
      ['Événement publié : GoalReached (goal-reached:d1:2026-10-12)'],
      ['Événement publié : GoalReached (goal-reached:d1:2026-10-13)'],
    ]);
  });
});
