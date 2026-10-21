import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ApiProblems } from '../http/openapi.js';
import { DeviceAuthGuard } from './device-auth.guard.js';

/**
 * Protège un contrôleur d'appareil ou de compte : jeton d'appareil exigé (DeviceAuthGuard),
 * et contrat OpenAPI à jour (schéma Bearer, réponses 401 et 403). Une ligne par contrôleur :
 * facile à voir en revue, impossible d'oublier la moitié.
 */
export const DeviceAuthenticated = () =>
  applyDecorators(UseGuards(DeviceAuthGuard), ApiBearerAuth(), ApiProblems(401, 403));
