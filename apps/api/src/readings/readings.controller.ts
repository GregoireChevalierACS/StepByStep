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
import { ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { deviceNotFoundException, missingTimeZoneException } from '../devices/device-errors.js';
import { recordReadingsResponse } from '../http/contract.js';
import { ApiProblems, openApiSchema } from '../http/openapi.js';
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
      return missingTimeZoneException();
    case 'UnknownTimeZone':
      return new UnprocessableEntityException(`Fuseau horaire inconnu : ${error.timeZone}`);
  }
};

@ApiTags('Relevés')
@Controller({ path: 'devices/:deviceId/readings', version: '1' })
export class ReadingsController {
  constructor(private readonly recordReadings: RecordReadingsService) {}

  /**
   * Reçoit un lot de relevés (et de changements de fuseau) : idempotent, un lot renvoyé
   * n'a aucun effet. 200 et non 201 : un lot peut ne rien créer, la réponse est un compte rendu.
   */
  @Post()
  @ApiOperation({
    summary: 'Envoyer un lot de relevés (idempotent) et recalculer les jours touchés',
  })
  @ApiParam({ name: 'deviceId', schema: openApiSchema(deviceIdParam) })
  @ApiBody({ schema: openApiSchema(recordReadingsBody) })
  @ApiOkResponse({ schema: openApiSchema(recordReadingsResponse, 'output') })
  @ApiProblems(400, 404, 409, 422)
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
