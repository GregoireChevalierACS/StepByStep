import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { forbiddenException, unauthenticatedException } from './auth-errors.js';
import { DeviceTokens } from './device-tokens.js';

// La garde ne dépend que de ce qu'elle lit et écrit (pas d'Express), comme le filtre d'erreurs.
interface HttpRequest {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly params: Readonly<Record<string, string | undefined>>;
}

interface HttpResponse {
  setHeader(name: string, value: string): unknown;
}

const BEARER = /^Bearer (\S+)$/;

/**
 * Garde des routes d'un appareil ou d'un compte : exige un jeton d'appareil valide
 * (`Authorization: Bearer …`) qui correspond au `:deviceId` ou au `:accountId` de l'URL.
 * 401 sans jeton valide (avec `WWW-Authenticate: Bearer`, RFC 6750) ; 403 avec un jeton
 * valide mais pour une autre ressource. Une route sans l'un de ces paramètres est refusée :
 * oublier de le déclarer ne doit pas ouvrir l'accès à tout le monde.
 */
@Injectable()
export class DeviceAuthGuard implements CanActivate {
  constructor(private readonly tokens: DeviceTokens) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const { headers, params } = http.getRequest<HttpRequest>();
    const authorization = headers['authorization'];
    const token = typeof authorization === 'string' ? BEARER.exec(authorization)?.[1] : undefined;
    // Vérification inconditionnelle : aucune valeur fournie par l'appelant ne décide si elle a
    // lieu (une chaîne vide est refusée comme tout jeton invalide). Le choix du message, lui,
    // n'intervient qu'après, sur le chemin du refus.
    const claims = await this.tokens.verify(token ?? '');
    if (claims === undefined) {
      http.getResponse<HttpResponse>().setHeader('WWW-Authenticate', 'Bearer');
      throw unauthenticatedException(
        token === undefined
          ? 'Jeton d’appareil attendu : en-tête Authorization: Bearer <jeton>.'
          : 'Jeton d’appareil invalide ou expiré.',
      );
    }

    const { deviceId, accountId } = params;
    const allowed =
      deviceId !== undefined
        ? deviceId === claims.deviceId
        : accountId !== undefined && accountId === claims.accountId;
    if (!allowed) throw forbiddenException();
    return true;
  }
}
