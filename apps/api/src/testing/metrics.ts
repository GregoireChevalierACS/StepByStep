import type { Clock } from '@stepbystep/domain';
import { Registry } from 'prom-client';
import { systemClock } from '../clock/clock.js';
import { Metrics } from '../observability/metrics.js';

/** Métriques dans un registre neuf : chaque test part de zéro. */
export const testMetrics = (clock: Clock = systemClock): Metrics =>
  new Metrics(new Registry(), clock);

/**
 * Valeur d'une série : le nom complet (`…_count` pour un histogramme) et les étiquettes
 * demandées ; `undefined` si la série n'existe pas encore.
 */
export const metricValue = async (
  metrics: Metrics,
  name: string,
  labels: Readonly<Record<string, string>> = {},
): Promise<number | undefined> => {
  const series = (await metrics.registry.getMetricsAsJSON()).flatMap((metric) =>
    // Pour un histogramme, chaque valeur porte son nom complet (`…_bucket`, `…_count`) dans
    // metricName, que les types de prom-client ne déclarent pas.
    metric.values.map((value: { metricName?: string } & (typeof metric.values)[number]) => ({
      ...value,
      name: value.metricName ?? metric.name,
    })),
  );
  return series.find(
    (value) =>
      value.name === name &&
      Object.entries(labels).every(([label, expected]) => value.labels[label] === expected),
  )?.value;
};
