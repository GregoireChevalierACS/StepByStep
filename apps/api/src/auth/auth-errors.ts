import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

const PROBLEMS = 'https://github.com/GregoireChevalierACS/StepByStep/blob/main/docs/problems.md';

/** Types de problème (RFC 9457) de l'authentification, documentés dans docs/problems.md. */
export const INVALID_CREDENTIALS_PROBLEM_TYPE = `${PROBLEMS}#invalid-credentials`;
export const UNAUTHENTICATED_PROBLEM_TYPE = `${PROBLEMS}#unauthenticated`;
export const FORBIDDEN_PROBLEM_TYPE = `${PROBLEMS}#forbidden`;

/** Secret refusé à l'échange : appareil inconnu, sans secret, ou secret faux (indiscernables). */
export interface InvalidCredentials {
  readonly kind: 'InvalidCredentials';
}

export const invalidCredentialsException = (): UnauthorizedException =>
  new UnauthorizedException({
    type: INVALID_CREDENTIALS_PROBLEM_TYPE,
    title: 'Identifiants invalides',
    message: 'Appareil ou secret invalide.',
  });

export const unauthenticatedException = (detail: string): UnauthorizedException =>
  new UnauthorizedException({
    type: UNAUTHENTICATED_PROBLEM_TYPE,
    title: 'Authentification requise',
    message: detail,
  });

export const forbiddenException = (): ForbiddenException =>
  new ForbiddenException({
    type: FORBIDDEN_PROBLEM_TYPE,
    title: 'Accès refusé',
    message: 'Ce jeton ne donne pas accès à cette ressource.',
  });
