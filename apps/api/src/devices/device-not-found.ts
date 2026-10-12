import { NotFoundException } from '@nestjs/common';

/** Erreur commune aux cas d'usage qui portent sur un appareil. */
export interface DeviceNotFound {
  readonly kind: 'DeviceNotFound';
  readonly deviceId: string;
}

export const deviceNotFoundException = ({ deviceId }: DeviceNotFound): NotFoundException =>
  new NotFoundException(`Appareil inconnu : ${deviceId}`);
