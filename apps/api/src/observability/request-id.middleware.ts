import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { runInRequestContext } from './request-context.js';

export const REQUEST_ID_HEADER = 'X-Request-Id';

// Identifiant reçu accepté tel quel s'il est court et sans caractère spécial : il est recopié
// dans les journaux et la réponse, il ne doit pas pouvoir y injecter de texte.
const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

// Le middleware ne dépend que de ce qu'il lit et écrit (pas d'Express), comme le filtre.
interface HttpRequest {
  readonly method: string;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  /** Route qui a traité la requête, renseignée par le routeur ; absente pour une 404 de route. */
  readonly route?: { readonly path?: unknown };
}

interface HttpResponse {
  readonly statusCode: number;
  setHeader(name: string, value: string): unknown;
  once(event: 'finish', listener: () => void): unknown;
}

const logger = new Logger('HTTP');

/**
 * Donne un identifiant à chaque requête : celui du client ou d'un proxy s'il est bien formé
 * (pour suivre une requête d'un service à l'autre), un nouveau sinon. Renvoyé dans l'en-tête
 * X-Request-Id de la réponse : un utilisateur qui signale une erreur peut le citer. Toute ligne
 * journalisée pendant la requête le porte. À la fin, une ligne d'accès : méthode, modèle de
 * route (jamais l'URL réelle, qui contient des identifiants et des paramètres), statut, durée.
 */
export const requestIdMiddleware = (
  request: HttpRequest,
  response: HttpResponse,
  next: () => void,
): void => {
  const received = request.headers['x-request-id'];
  const requestId =
    typeof received === 'string' && VALID_REQUEST_ID.test(received) ? received : randomUUID();
  response.setHeader(REQUEST_ID_HEADER, requestId);
  const startedAt = process.hrtime.bigint();

  runInRequestContext({ requestId }, () => {
    response.once('finish', () => {
      const route = typeof request.route?.path === 'string' ? request.route.path : null;
      const access = {
        method: request.method,
        route,
        status: response.statusCode,
        durationMs: Number((process.hrtime.bigint() - startedAt) / 1000n) / 1000,
      };
      // La sonde de santé est appelée toutes les quelques secondes : en debug seulement.
      if (route === '/v1/health') logger.debug('Requête traitée', access);
      else logger.log('Requête traitée', access);
    });
    next();
  });
};
