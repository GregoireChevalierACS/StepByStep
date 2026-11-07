import {
  Body,
  Controller,
  Delete,
  HttpCode,
  NotFoundException,
  Param,
  Put,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ApiBody,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { DeviceAuthenticated } from '../auth/device-authenticated.decorator.js';
import { nicknameResponse } from '../http/contract.js';
import { uuidSchema } from '../http/schemas.js';
import { ApiProblems, openApiSchema } from '../http/openapi.js';
import { ZodValidationPipe } from '../http/zod-validation.pipe.js';
import { AccountsService } from './accounts.service.js';
import { setNicknameBody, type SetNicknameBody } from './set-nickname.dto.js';

@ApiTags('Compte')
@DeviceAuthenticated()
@Controller({ path: 'accounts/:accountId', version: '1' })
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  /** Pseudo affiché aux membres des groupes du compte. PUT : idempotent. */
  @Put('nickname')
  @ApiOperation({ summary: 'Choisir le pseudo du compte (idempotent)' })
  @ApiParam({ name: 'accountId', schema: openApiSchema(uuidSchema) })
  @ApiBody({ schema: openApiSchema(setNicknameBody) })
  @ApiOkResponse({ schema: openApiSchema(nicknameResponse, 'output') })
  @ApiProblems(400, 404, 422)
  async setNickname(
    @Param('accountId', new ZodValidationPipe(uuidSchema)) accountId: string,
    @Body(new ZodValidationPipe(setNicknameBody)) body: SetNicknameBody,
  ): Promise<{ nickname: string }> {
    const result = await this.accounts.setNickname(accountId, body.nickname);
    if (result.ok) return { nickname: result.value.value };
    if (result.error.kind === 'AccountNotFound') {
      throw new NotFoundException(`Compte inconnu : ${result.error.accountId}`);
    }
    throw new UnprocessableEntityException({
      message: 'Valeurs refusées par les règles métier',
      errors: [{ path: 'nickname', message: `${result.error.kind}:${result.error.reason}` }],
    });
  }

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
