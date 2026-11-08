import { ConflictException, NotFoundException } from '@nestjs/common';

const PROBLEMS = 'https://github.com/GregoireChevalierACS/StepByStep/blob/main/docs/problems.md';

/** Types de problème (RFC 9457) des groupes, documentés dans docs/problems.md. */
export const NICKNAME_REQUIRED_PROBLEM_TYPE = `${PROBLEMS}#nickname-required`;
export const INVITE_CODE_UNKNOWN_PROBLEM_TYPE = `${PROBLEMS}#invite-code-unknown`;
export const GROUP_FULL_PROBLEM_TYPE = `${PROBLEMS}#group-full`;

/** Le compte n'a pas encore de pseudo : les autres membres ne sauraient pas qui il est. */
export interface NicknameRequired {
  readonly kind: 'NicknameRequired';
}

export const nicknameRequiredException = (): ConflictException =>
  new ConflictException({
    type: NICKNAME_REQUIRED_PROBLEM_TYPE,
    title: 'Pseudo requis',
    message:
      'Choisir un pseudo (PUT /v1/accounts/{accountId}/nickname) avant d’entrer dans un groupe.',
  });

export const inviteCodeUnknownException = (): NotFoundException =>
  new NotFoundException({
    type: INVITE_CODE_UNKNOWN_PROBLEM_TYPE,
    title: 'Code d’invitation inconnu',
    message: 'Aucun groupe ne correspond à ce code (mal saisi, ou groupe supprimé).',
  });

export const groupFullException = (maxMembers: number): ConflictException =>
  new ConflictException({
    type: GROUP_FULL_PROBLEM_TYPE,
    title: 'Groupe complet',
    message: `Ce groupe a atteint ${String(maxMembers)} membres.`,
  });
