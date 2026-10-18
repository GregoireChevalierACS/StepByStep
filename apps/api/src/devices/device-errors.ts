import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';

/** Erreurs communes aux cas d'usage qui portent sur un appareil, et leur traduction HTTP. */
export interface DeviceNotFound {
  readonly kind: 'DeviceNotFound';
  readonly deviceId: string;
}

/** L'appareil n'a encore transmis aucun fuseau : ses jours locaux sont incalculables. */
export interface MissingTimeZone {
  readonly kind: 'MissingTimeZone';
  readonly deviceId: string;
}

/**
 * Type de problème (RFC 9457) de l'appareil inconnu : identifiant stable, testé par l'app pour
 * se réenregistrer, et adresse de sa documentation. Une simple 404 ne suffit pas : une route
 * mal écrite en renvoie une aussi.
 */
export const DEVICE_NOT_FOUND_PROBLEM_TYPE =
  'https://github.com/GregoireChevalierACS/StepByStep/blob/main/docs/problems.md#device-not-found';

export const deviceNotFoundException = ({ deviceId }: DeviceNotFound): NotFoundException =>
  new NotFoundException({
    type: DEVICE_NOT_FOUND_PROBLEM_TYPE,
    title: 'Appareil inconnu',
    message: `Appareil inconnu : ${deviceId}`,
  });

export const missingTimeZoneException = (): UnprocessableEntityException =>
  new UnprocessableEntityException(
    'Aucun fuseau horaire connu pour cet appareil : le transmettre au premier envoi.',
  );
