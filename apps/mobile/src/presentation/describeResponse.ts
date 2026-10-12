import type { ApiResponse } from '../application/ReadingSync';

/** Compte rendu de POST /v1/devices/:deviceId/readings (200). */
interface RecordReadingsReport {
  readonly accepted: number;
  readonly duplicates: number;
  readonly days: readonly { readonly day: string; readonly steps: number }[];
}

/** Erreur au format Problem Details (RFC 9457), utilisé par toute l'API. */
interface ProblemDetails {
  readonly title: string;
  readonly detail: string;
  readonly errors?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isDailySteps = (value: unknown): boolean =>
  isRecord(value) && typeof value['day'] === 'string' && typeof value['steps'] === 'number';

const isReport = (body: unknown): body is RecordReadingsReport =>
  isRecord(body) &&
  typeof body['accepted'] === 'number' &&
  typeof body['duplicates'] === 'number' &&
  Array.isArray(body['days']) &&
  body['days'].every(isDailySteps);

const isProblem = (body: unknown): body is ProblemDetails =>
  isRecord(body) && typeof body['title'] === 'string' && typeof body['detail'] === 'string';

/**
 * Texte affiché après un envoi de relevés : compte rendu lisible (acceptés, doublons, pas par
 * jour recalculés) ou erreur de l'API. Toute autre réponse est affichée brute, pour ne jamais
 * masquer ce que le serveur a répondu.
 */
export function describeResponse({ status, body }: ApiResponse): string {
  if (status === 200 && isReport(body)) {
    return [
      `Acceptés : ${String(body.accepted)} · doublons ignorés : ${String(body.duplicates)}`,
      ...(body.days.length === 0
        ? ['Aucun jour recalculé.']
        : [
            'Pas par jour recalculés :',
            ...body.days.map(({ day, steps }) => `  ${day} : ${String(steps)}`),
          ]),
    ].join('\n');
  }
  if (isProblem(body)) {
    const errors = body.errors === undefined ? '' : `\n${JSON.stringify(body.errors)}`;
    return `HTTP ${String(status)} ${body.title} : ${body.detail}${errors}`;
  }
  return `HTTP ${String(status)}\n${JSON.stringify(body, null, 2)}`;
}
