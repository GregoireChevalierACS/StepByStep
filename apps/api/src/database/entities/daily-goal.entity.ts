import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { AccountEntity } from './account.entity.js';

/** Objectif quotidien en vigueur à partir d'un jour : changer d'objectif ne réécrit pas le passé. */
@Entity({ name: 'daily_goals' })
@Check('CHK_daily_goals_goal_steps', '"goal_steps" > 0')
export class DailyGoalEntity {
  @PrimaryColumn({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  // Jour local, au format AAAA-MM-JJ (pas d'heure ni de fuseau).
  @PrimaryColumn({ name: 'effective_from', type: 'date' })
  effectiveFrom!: string;

  @Column({ name: 'goal_steps', type: 'integer' })
  goalSteps!: number;

  @ManyToOne(() => AccountEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'account_id' })
  account?: AccountEntity;
}
