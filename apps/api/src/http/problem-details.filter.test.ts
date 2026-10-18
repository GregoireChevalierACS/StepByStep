import { type ArgumentsHost, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type ProblemDetails, ProblemDetailsFilter } from './problem-details.filter.js';

// Réponse HTTP minimale qui enregistre ce que le filtre envoie.
const fakeHttp = (url: string) => {
  const sent: { status?: number; type?: string; body?: ProblemDetails } = {};
  const response = {
    status(code: number) {
      sent.status = code;
      return response;
    },
    type(contentType: string) {
      sent.type = contentType;
      return response;
    },
    json(body: ProblemDetails) {
      sent.body = body;
      return response;
    },
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ originalUrl: url }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost; // Seules les méthodes utilisées par le filtre sont fournies.
  return { host, sent };
};

describe('ProblemDetailsFilter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('transforme une erreur inattendue en 500 générique, sans fuite du détail interne', () => {
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { host, sent } = fakeHttp('/v1/devices');

    new ProblemDetailsFilter().catch(new Error('connexion refusée, mot de passe s3cr3t'), host);

    expect(sent.status).toBe(500);
    expect(sent.type).toBe('application/problem+json');
    expect(sent.body).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      detail: 'Une erreur interne est survenue.',
      instance: '/v1/devices',
    });
    expect(JSON.stringify(sent.body)).not.toContain('s3cr3t');
    // Le détail complet reste disponible côté serveur, dans les logs.
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('s3cr3t'));
  });

  it('conserve le détail et la liste des erreurs d’une erreur HTTP volontaire', () => {
    const { host, sent } = fakeHttp('/v1/devices/x/readings');
    const errors = [{ path: 'readings', message: 'Required' }];

    new ProblemDetailsFilter().catch(
      new BadRequestException({ message: 'Requête invalide', errors }),
      host,
    );

    expect(sent.status).toBe(400);
    expect(sent.body).toEqual({
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
      detail: 'Requête invalide',
      instance: '/v1/devices/x/readings',
      errors,
    });
  });

  it('reprend le type et le titre d’une erreur qui déclare son propre type de problème', () => {
    const { host, sent } = fakeHttp('/v1/devices/x/readings');

    new ProblemDetailsFilter().catch(
      new NotFoundException({
        type: 'https://example.org/problems/device-not-found',
        title: 'Appareil inconnu',
        message: 'Appareil inconnu : x',
      }),
      host,
    );

    expect(sent.body).toEqual({
      type: 'https://example.org/problems/device-not-found',
      title: 'Appareil inconnu',
      status: 404,
      detail: 'Appareil inconnu : x',
      instance: '/v1/devices/x/readings',
    });
  });
});
