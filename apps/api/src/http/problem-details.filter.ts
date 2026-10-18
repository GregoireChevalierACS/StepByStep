import { STATUS_CODES } from 'node:http';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

/** Corps d'erreur standard (RFC 9457, « Problem Details for HTTP APIs »). */
export interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance: string;
  readonly errors?: unknown;
}

// Le filtre ne dépend que de ce qu'il utilise (pas d'Express) : l'URL de la requête et
// l'envoi de la réponse. Express, utilisé par NestJS, respecte ces deux interfaces.
interface HttpRequest {
  readonly originalUrl: string;
}

interface HttpResponse {
  status(code: number): HttpResponse;
  type(contentType: string): HttpResponse;
  json(body: unknown): unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * Toutes les erreurs de l'API au même format, `application/problem+json`. Une erreur
 * inattendue devient une 500 générique : aucun détail interne n'est envoyé au client,
 * l'erreur complète est journalisée côté serveur.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<HttpRequest>();
    const response = http.getResponse<HttpResponse>();

    const problem =
      exception instanceof HttpException
        ? this.fromHttpException(exception, request.originalUrl)
        : this.fromUnexpectedError(exception, request.originalUrl);

    response.status(problem.status).type('application/problem+json').json(problem);
  }

  private fromHttpException(exception: HttpException, instance: string): ProblemDetails {
    const status = exception.getStatus();
    const body = exception.getResponse();
    const detail =
      isRecord(body) && typeof body['message'] === 'string' ? body['message'] : exception.message;
    const errors = isRecord(body) ? body['errors'] : undefined;
    // Une erreur peut déclarer son propre type de problème (RFC 9457, § 3.1.1) : un identifiant
    // stable que le client teste, au lieu du statut ou du texte de `detail`. Son titre va avec.
    // Sinon, `about:blank`, dont le titre est par définition le libellé du statut HTTP.
    const type = isRecord(body) && typeof body['type'] === 'string' ? body['type'] : undefined;
    const title = isRecord(body) && typeof body['title'] === 'string' ? body['title'] : undefined;
    return {
      type: type ?? 'about:blank',
      title: (type === undefined ? undefined : title) ?? STATUS_CODES[status] ?? 'Error',
      status,
      detail,
      instance,
      ...(errors === undefined ? {} : { errors }),
    };
  }

  private fromUnexpectedError(exception: unknown, instance: string): ProblemDetails {
    this.logger.error(
      exception instanceof Error ? (exception.stack ?? exception.message) : exception,
    );
    const status = HttpStatus.INTERNAL_SERVER_ERROR;
    return {
      type: 'about:blank',
      title: STATUS_CODES[status] ?? 'Internal Server Error',
      status,
      detail: 'Une erreur interne est survenue.',
      instance,
    };
  }
}
