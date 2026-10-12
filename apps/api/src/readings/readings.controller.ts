import {
  Body,
  ConflictException,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UnprocessableEntityException,
  type HttpException,
} from '@nestjs/common';
import { deviceNotFoundException } from '../devices/device-not-found.js';
import { ZodValidationPipe } from '../http/zod-validation.pipe.js';
import {
  deviceIdParam,
  recordReadingsBody,
  type RecordReadingsBody,
  toDomain,
} from './record-readings.dto.js';
import {
  type RecordReadingsError,
  type RecordReadingsReport,
  RecordReadingsService,
} from './record-readings.service.js';

/** Erreurs du cas d'usage → codes HTTP (corps au format Problem Details, filtre global). */
const toHttpException = (error: RecordReadingsError): HttpException => {
  switch (error.kind) {
    case 'DeviceNotFound':
      return deviceNotFoundException(error);
    case 'ConflictingTimeZonePeriods':
      return new ConflictException(
        `Fuseaux contradictoires au même instant : ${error.timeZones.join(' et ')}`,
      );
    case 'MissingTimeZone':
      return new UnprocessableEntityException(
        'Aucun fuseau horaire connu pour cet appareil : le transmettre au premier envoi.',
      );
    case 'UnknownTimeZone':
      return new UnprocessableEntityException(`Fuseau horaire inconnu : ${error.timeZone}`);
  }
};

@Controller({ path: 'devices/:deviceId/readings', version: '1' })
export class ReadingsController {
  constructor(private readonly recordReadings: RecordReadingsService) {}

  /**
   * Reçoit un lot de relevés (et de changements de fuseau) : idempotent, un lot renvoyé
   * n'a aucun effet. 200 et non 201 : un lot peut ne rien créer, la réponse est un compte rendu.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async record(
    @Param('deviceId', new ZodValidationPipe(deviceIdParam)) deviceId: string,
    @Body(new ZodValidationPipe(recordReadingsBody)) body: RecordReadingsBody,
  ): Promise<RecordReadingsReport> {
    const input = toDomain(body);
    if (!input.ok) {
      throw new UnprocessableEntityException({
        message: 'Valeurs refusées par les règles métier',
        errors: input.error,
      });
    }
    const result = await this.recordReadings.record({ deviceId, ...input.value });
    if (!result.ok) throw toHttpException(result.error);
    return result.value;
  }
}
