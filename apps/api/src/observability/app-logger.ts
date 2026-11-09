import { ConsoleLogger, type LogLevel } from '@nestjs/common';
import { currentRequestId } from './request-context.js';

export type LogFormat = 'json' | 'text';

// Noms de propriétés masqués dans tout objet journalisé, à toute profondeur : défense en
// profondeur, au cas où un secret d'appareil ou un jeton finirait un jour dans un journal.
const REDACTED = ['secret', 'token', 'authorization', 'password', 'jwt_secret', 'database_url'];

/**
 * Journal de l'API. En JSON (production) : une ligne par événement, lisible par un outil
 * d'agrégation, avec l'identifiant de la requête en cours (`requestId`) quand il y en a une.
 * En texte (développement) : le format habituel de Nest.
 */
export class AppLogger extends ConsoleLogger {
  constructor(format: LogFormat) {
    super({
      json: format === 'json',
      // Paramètres structurés à la racine de la ligne JSON : { method, route, status… }.
      flattenParams: true,
      redact: REDACTED,
    });
  }

  protected override getJsonLogObject(
    message: unknown,
    options: {
      context: string;
      logLevel: LogLevel;
      writeStreamType?: 'stdout' | 'stderr';
      errorStack?: unknown;
      params?: Record<string, unknown>;
      error?: Error;
    },
  ): ReturnType<ConsoleLogger['getJsonLogObject']> {
    const entry = super.getJsonLogObject(message, options);
    const requestId = currentRequestId();
    return requestId === undefined ? entry : { ...entry, requestId };
  }
}
