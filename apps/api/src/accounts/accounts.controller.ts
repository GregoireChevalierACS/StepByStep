import { Controller, Delete, HttpCode, Param } from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { DeviceAuthenticated } from '../auth/device-authenticated.decorator.js';
import { uuidSchema } from '../http/schemas.js';
import { ApiProblems, openApiSchema } from '../http/openapi.js';
import { ZodValidationPipe } from '../http/zod-validation.pipe.js';
import { AccountsService } from './accounts.service.js';

@ApiTags('Compte')
@DeviceAuthenticated()
@Controller({ path: 'accounts/:accountId', version: '1' })
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  /**
   * Efface le compte, ses appareils et toutes leurs données. 204 aussi pour un compte déjà
   * effacé : DELETE est idempotent, et le jeton d'un appareil effacé reste valide jusqu'à son
   * expiration (15 minutes), ce qui permet de renvoyer la demande sans erreur.
   */
  @Delete()
  @HttpCode(204)
  @ApiOperation({ summary: 'Supprimer le compte et toutes ses données serveur (idempotent)' })
  @ApiParam({ name: 'accountId', schema: openApiSchema(uuidSchema) })
  @ApiNoContentResponse({ description: 'Compte et données effacés (ou déjà effacés)' })
  @ApiProblems(400)
  async delete(
    @Param('accountId', new ZodValidationPipe(uuidSchema)) accountId: string,
  ): Promise<void> {
    await this.accounts.delete(accountId);
  }
}
