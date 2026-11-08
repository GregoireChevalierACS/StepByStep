import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { DeviceAuthenticated } from '../auth/device-authenticated.decorator.js';
import { groupResponse, groupsResponse } from '../http/contract.js';
import { ApiProblems, openApiSchema } from '../http/openapi.js';
import { uuidSchema } from '../http/schemas.js';
import { ZodValidationPipe } from '../http/zod-validation.pipe.js';
import type { AccountNotFound } from '../goals/goals.service.js';
import {
  groupFullException,
  inviteCodeUnknownException,
  type NicknameRequired,
  nicknameRequiredException,
} from './group-errors.js';
import {
  createGroupBody,
  type CreateGroupBody,
  groupIdParam,
  joinGroupBody,
  type JoinGroupBody,
} from './groups.dto.js';
import { type GroupView, GroupsService } from './groups.service.js';

// Erreurs communes à la création et à l'arrivée dans un groupe.
const entryException = (error: AccountNotFound | NicknameRequired) =>
  error.kind === 'AccountNotFound'
    ? new NotFoundException(`Compte inconnu : ${error.accountId}`)
    : nicknameRequiredException();

/**
 * Groupes du compte. Sous /accounts/{accountId} : la garde vérifie que le jeton est celui d'un
 * appareil de ce compte, sans règle propre aux groupes. Seuls les groupes dont le compte est
 * membre lui sont visibles.
 */
@ApiTags('Groupes')
@DeviceAuthenticated()
@Controller({ path: 'accounts/:accountId/groups', version: '1' })
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer un groupe (le compte en devient le premier membre)' })
  @ApiParam({ name: 'accountId', schema: openApiSchema(uuidSchema) })
  @ApiBody({ schema: openApiSchema(createGroupBody) })
  @ApiCreatedResponse({ schema: openApiSchema(groupResponse, 'output') })
  @ApiProblems(400, 404, 409, 422)
  async create(
    @Param('accountId', new ZodValidationPipe(uuidSchema)) accountId: string,
    @Body(new ZodValidationPipe(createGroupBody)) body: CreateGroupBody,
  ): Promise<GroupView> {
    const result = await this.groups.create(accountId, body.name);
    if (result.ok) return result.value;
    if (result.error.kind !== 'InvalidGroupName') throw entryException(result.error);
    throw new UnprocessableEntityException({
      message: 'Valeurs refusées par les règles métier',
      errors: [{ path: 'name', message: `${result.error.kind}:${result.error.reason}` }],
    });
  }

  /** Rejoindre par le code d'invitation. Idempotent : un membre qui revient reçoit le groupe. */
  @Post('join')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rejoindre un groupe avec son code d’invitation (idempotent)' })
  @ApiParam({ name: 'accountId', schema: openApiSchema(uuidSchema) })
  @ApiBody({ schema: openApiSchema(joinGroupBody) })
  @ApiOkResponse({ schema: openApiSchema(groupResponse, 'output') })
  @ApiProblems(400, 404, 409)
  async join(
    @Param('accountId', new ZodValidationPipe(uuidSchema)) accountId: string,
    @Body(new ZodValidationPipe(joinGroupBody)) body: JoinGroupBody,
  ): Promise<GroupView> {
    const result = await this.groups.join(accountId, body.inviteCode);
    if (result.ok) return result.value;
    switch (result.error.kind) {
      case 'InviteCodeUnknown':
        throw inviteCodeUnknownException();
      case 'GroupFull':
        throw groupFullException(result.error.maxMembers);
      default:
        throw entryException(result.error);
    }
  }

  @Get()
  @ApiOperation({ summary: 'Groupes du compte et leurs membres' })
  @ApiParam({ name: 'accountId', schema: openApiSchema(uuidSchema) })
  @ApiOkResponse({ schema: openApiSchema(groupsResponse, 'output') })
  @ApiProblems(400)
  list(
    @Param('accountId', new ZodValidationPipe(uuidSchema)) accountId: string,
  ): Promise<GroupView[]> {
    return this.groups.list(accountId);
  }

  /** Quitter le groupe. 204 aussi si le compte n'en était pas (ou plus) membre : idempotent. */
  @Delete(':groupId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Quitter un groupe (supprimé avec son dernier membre, idempotent)' })
  @ApiParam({ name: 'accountId', schema: openApiSchema(uuidSchema) })
  @ApiParam({ name: 'groupId', schema: openApiSchema(groupIdParam) })
  @ApiNoContentResponse({ description: 'Le compte n’est plus membre du groupe' })
  @ApiProblems(400)
  async leave(
    @Param('accountId', new ZodValidationPipe(uuidSchema)) accountId: string,
    @Param('groupId', new ZodValidationPipe(groupIdParam)) groupId: string,
  ): Promise<void> {
    await this.groups.leave(accountId, groupId);
  }
}
