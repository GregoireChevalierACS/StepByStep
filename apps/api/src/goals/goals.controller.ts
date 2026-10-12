import {
  Body,
  Controller,
  NotFoundException,
  Param,
  Put,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { goalHistoryResponse } from '../http/contract.js';
import { ApiProblems, openApiSchema } from '../http/openapi.js';
import { ZodValidationPipe } from '../http/zod-validation.pipe.js';
import { type GoalHistoryEntry, GoalsService } from './goals.service.js';
import { accountIdParam, setGoalBody, type SetGoalBody, toGoalChange } from './set-goal.dto.js';

@ApiTags('Objectif')
@Controller({ path: 'accounts/:accountId/goal', version: '1' })
export class GoalsController {
  constructor(private readonly goals: GoalsService) {}

  /**
   * Fixe l'objectif à partir d'un jour et renvoie l'historique du compte. PUT : idempotent,
   * la même requête renvoyée (après une coupure réseau…) laisse le même état.
   */
  @Put()
  @ApiOperation({ summary: "Fixer l'objectif quotidien à partir d'un jour (idempotent)" })
  @ApiParam({ name: 'accountId', schema: openApiSchema(accountIdParam) })
  @ApiBody({ schema: openApiSchema(setGoalBody) })
  @ApiOkResponse({ schema: openApiSchema(goalHistoryResponse, 'output') })
  @ApiProblems(400, 404, 422)
  async set(
    @Param('accountId', new ZodValidationPipe(accountIdParam)) accountId: string,
    @Body(new ZodValidationPipe(setGoalBody)) body: SetGoalBody,
  ): Promise<GoalHistoryEntry[]> {
    const change = toGoalChange(body);
    if (!change.ok) {
      throw new UnprocessableEntityException({
        message: 'Valeurs refusées par les règles métier',
        errors: change.error,
      });
    }
    const result = await this.goals.set(accountId, change.value);
    if (!result.ok) throw new NotFoundException(`Compte inconnu : ${result.error.accountId}`);
    return result.value;
  }
}
