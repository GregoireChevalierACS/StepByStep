import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppLogger } from './app-logger.js';
import { runInRequestContext } from './request-context.js';

describe('AppLogger', () => {
  let lines: string[];

  beforeEach(() => {
    lines = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      lines.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const logged = () => lines.map((line) => JSON.parse(line) as Record<string, unknown>);

  it('écrit une ligne JSON par événement, avec ses paramètres à la racine', () => {
    new AppLogger('json').log('Requête traitée', { route: '/v1/health', status: 200 }, 'HTTP');

    expect(logged()).toEqual([
      expect.objectContaining({
        level: 'log',
        context: 'HTTP',
        message: 'Requête traitée',
        route: '/v1/health',
        status: 200,
      }),
    ]);
  });

  it('ajoute l’identifiant de la requête en cours, et seulement pendant une requête', () => {
    const logger = new AppLogger('json');

    runInRequestContext({ requestId: 'req-42' }, () => {
      logger.log('pendant');
    });
    logger.log('hors requête');

    const [during, outside] = logged();
    expect(during).toMatchObject({ message: 'pendant', requestId: 'req-42' });
    expect(outside).not.toHaveProperty('requestId');
  });

  it('garde l’identifiant à travers les attentes asynchrones de la requête', async () => {
    const logger = new AppLogger('json');

    await runInRequestContext({ requestId: 'req-async' }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      logger.log('après une attente');
    });

    expect(logged()[0]).toMatchObject({ requestId: 'req-async' });
  });

  it('masque les secrets et les jetons, même imbriqués', () => {
    new AppLogger('json').log('enregistrement', {
      deviceId: 'd1',
      credentials: { secret: 'ne-doit-pas-sortir', token: 'pas-plus' },
    });

    const [entry] = lines;
    expect(entry).toContain('d1');
    expect(entry).not.toContain('ne-doit-pas-sortir');
    expect(entry).not.toContain('pas-plus');
  });
});
