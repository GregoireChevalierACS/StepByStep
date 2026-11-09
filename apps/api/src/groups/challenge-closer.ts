import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { type Clock, closableWeek, type IsoWeek, LocalDate } from '@stepbystep/domain';
import { CLOCK } from '../clock/clock.js';
import { RANKING_QUERY, type RankingQuery } from './ranking.query.js';
import {
  WEEKLY_RESULTS_REPOSITORY,
  type WeeklyResultsRepository,
} from './weekly-results.repository.js';

export interface ChallengeCloserOptions {
  /** Intervalle entre deux passages ; 0 désactive la clôture automatique. */
  readonly intervalMs: number;
}

export const CHALLENGE_CLOSER_OPTIONS = Symbol('CHALLENGE_CLOSER_OPTIONS');

/**
 * Clôture des défis hebdomadaires (ADR 0002, décision 20) : à chaque passage, fige le
 * classement de la dernière semaine close (closableWeek du domaine) pour les groupes qui ne
 * l'ont pas encore. Idempotent : un passage horaire rattrape une clôture manquée (redémarrage,
 * panne) tant que la semaine suivante n'est pas close à son tour. Entre plusieurs instances de
 * l'API, le dépôt garantit qu'une seule clôture tourne à la fois.
 */
@Injectable()
export class ChallengeCloser implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ChallengeCloser.name);
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;

  constructor(
    @Inject(WEEKLY_RESULTS_REPOSITORY) private readonly results: WeeklyResultsRepository,
    @Inject(RANKING_QUERY) private readonly rankings: RankingQuery,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(CHALLENGE_CLOSER_OPTIONS) private readonly options: ChallengeCloserOptions,
  ) {}

  /**
   * Fige la dernière semaine close. Renvoie la semaine et le nombre de groupes figés ;
   * `closed` vaut `undefined` si une autre instance clôturait déjà.
   */
  async closeDueWeek(): Promise<{ week: IsoWeek; closed: number | undefined }> {
    // « Aujourd'hui » côté serveur, en UTC : le délai de clôture couvre déjà tous les fuseaux.
    const today = LocalDate.create(new Date(this.clock.now()).toISOString().slice(0, 10));
    if (!today.ok) throw new Error('Horloge invalide');
    const week = closableWeek(today.value);
    const closed = await this.results.closeWeek(week, (groupIds) =>
      this.rankings.weeklyRankings(groupIds, week),
    );
    return { week, closed };
  }

  onApplicationBootstrap(): void {
    if (this.options.intervalMs <= 0) return;
    this.timer = setInterval(() => void this.tick(), this.options.intervalMs);
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  private async tick(): Promise<void> {
    // Un passage lent ne doit pas en lancer un second dans le même processus.
    if (this.running) return;
    this.running = true;
    try {
      const { week, closed } = await this.closeDueWeek();
      if (closed !== undefined && closed > 0) {
        this.logger.log(`Semaine ${week.toString()} close pour ${String(closed)} groupe(s).`);
      }
    } catch (error) {
      this.logger.error(
        `Clôture des défis interrompue, nouvel essai au prochain passage : ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.running = false;
    }
  }
}
