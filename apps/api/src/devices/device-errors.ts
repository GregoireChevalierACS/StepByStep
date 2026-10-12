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

export const deviceNotFoundException = ({ deviceId }: DeviceNotFound): NotFoundException =>
  new NotFoundException(`Appareil inconnu : ${deviceId}`);

export const missingTimeZoneException = (): UnprocessableEntityException =>
  new UnprocessableEntityException(
    'Aucun fuseau horaire connu pour cet appareil : le transmettre au premier envoi.',
  );
