import type { LocalDate } from '@stepbystep/domain';
import type { DataSource, EntityManager } from 'typeorm';
import { DEFAULT_DAILY_GOAL } from '../../goals/default-daily-goal.js';

/** Appareil dont on veut la série, et son « aujourd'hui » (date locale dans son fuseau). */
export interface StreakTarget {
  readonly deviceId: string;
  readonly today: LocalDate;
}

/**
 * Série de jours avec l'objectif atteint, pour plusieurs appareils en une seule requête : la
 * brique d'un classement. Mêmes règles que computeStreak du domaine, qui reste la référence ;
 * un test de propriétés (fast-check) vérifie que les deux donnent toujours le même résultat.
 *
 * Technique « gaps and islands » : parmi les jours où l'objectif est atteint, triés, la date
 * moins le rang est constante sur une suite de jours consécutifs (un « îlot ») et change dès
 * qu'un jour manque. La série en cours est l'îlot qui se termine aujourd'hui ou hier : la
 * journée en cours ne casse pas la série tant que son objectif n'est pas atteint.
 *
 * Objectif d'un jour (comme GoalHistory et goalHistoryOrDefault) : chaque changement d'objectif
 * devient une période de validité, de sa date d'effet jusqu'au changement suivant (LEAD). La
 * première période commence à -infinity : avant son premier changement, un compte applique son
 * premier objectif. Sans aucun objectif, l'objectif par défaut. Calculer les périodes une fois
 * par compte, puis joindre sur l'intervalle, est 5 fois plus rapide qu'une sous-requête par jour
 * (mesures EXPLAIN ANALYZE dans docs/adr/0002, décision 17).
 */
const CURRENT_STREAKS_SQL = `
WITH targets AS (
  SELECT DISTINCT target.device_id, target.today
  FROM unnest($1::uuid[], $2::date[]) AS target (device_id, today)
),
periods AS (
  SELECT goal.account_id, goal.goal_steps,
         CASE WHEN ROW_NUMBER() OVER account_goals = 1 THEN DATE '-infinity'
              ELSE goal.effective_from END AS valid_from,
         COALESCE(LEAD(goal.effective_from) OVER account_goals, DATE 'infinity') AS valid_until
  FROM daily_goals goal
  WHERE goal.account_id IN (
    SELECT device.account_id FROM devices device JOIN targets target ON target.device_id = device.id
  )
  WINDOW account_goals AS (PARTITION BY goal.account_id ORDER BY goal.effective_from)
),
days AS (
  SELECT target.device_id, target.today, daily.day,
         daily.steps >= COALESCE(period.goal_steps, $3) AS reached
  FROM targets target
  JOIN devices device ON device.id = target.device_id
  JOIN daily_steps daily ON daily.device_id = target.device_id AND daily.day <= target.today
  LEFT JOIN periods period ON period.account_id = device.account_id
    AND daily.day >= period.valid_from AND daily.day < period.valid_until
),
islands AS (
  SELECT device_id, today, day,
         day - (ROW_NUMBER() OVER (PARTITION BY device_id, today ORDER BY day))::integer AS island
  FROM days
  WHERE reached
),
sized AS (
  SELECT device_id, today, MAX(day) AS last_day, COUNT(*)::integer AS length
  FROM islands
  GROUP BY device_id, today, island
)
SELECT target.device_id AS "deviceId", COALESCE(sized.length, 0) AS streak
FROM targets target
LEFT JOIN sized
  ON sized.device_id = target.device_id AND sized.today = target.today
  AND sized.last_day >= target.today - 1
`;

/**
 * Série en cours de chaque appareil demandé : 0 pour un appareil sans série ou inconnu. Un même
 * appareil ne doit être demandé qu'avec un seul « aujourd'hui » (la Map n'en garde qu'un).
 */
export const currentStreaks = async (
  database: DataSource | EntityManager,
  targets: readonly StreakTarget[],
): Promise<Map<string, number>> => {
  const rows: { deviceId: string; streak: number }[] = await database.query(CURRENT_STREAKS_SQL, [
    targets.map(({ deviceId }) => deviceId),
    targets.map(({ today }) => today.toString()),
    DEFAULT_DAILY_GOAL,
  ]);
  return new Map(rows.map(({ deviceId, streak }) => [deviceId, streak]));
};
