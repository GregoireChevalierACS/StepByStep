import {
  Body,
  Controller,
  NotFoundException,
  Param,
  Put,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ZodValidationPipe } from '../http/zod-validation.pipe.js';
import { type GoalHistoryEntry, GoalsService } from './goals.service.js';
import { accountIdParam, setGoalBody, type SetGoalBody, toGoalChange } from './set-goal.dto.js';

@Controller({ path: 'accounts/:accountId/goal', version: '1' })
export class GoalsController {
  constructor(private readonly goals: GoalsService) {}

  /**
   * Fixe l'objectif à partir d'un jour et renvoie l'historique du compte. PUT : idempotent,
   * la même requête renvoyée (après une coupure réseau…) laisse le même état.
   */
  @Put()
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
