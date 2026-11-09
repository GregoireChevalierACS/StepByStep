import { IsoWeek } from '../model/IsoWeek';
import type { LocalDate } from '../model/LocalDate';

/**
 * Délai entre la fin d'une semaine (dimanche) et sa clôture. La semaine se termine à minuit
 * dans le fuseau de chaque membre, jusqu'à UTC-12, et un téléphone resté hors ligne envoie ses
 * pas en retard : trois jours couvrent les fuseaux et laissent deux jours de rattrapage. Les
 * pas arrivés après la clôture ne changent plus le classement figé.
 */
export const CLOSING_DELAY_DAYS = 3;

/**
 * Dernière semaine qui peut être close au jour `today` (UTC, côté serveur) : la plus récente
 * dont le dimanche est passé d'au moins CLOSING_DELAY_DAYS jours. Le mercredi, la semaine
 * précédente devient close.
 */
export const closableWeek = (today: LocalDate): IsoWeek => {
  const lastClosableSunday = today.plusDays(-CLOSING_DELAY_DAYS);
  // La semaine du lendemain de ce dimanche (ou de ce jour, s'il n'est pas un dimanche) est
  // encore ouverte : la précédente est la dernière close.
  return IsoWeek.containing(lastClosableSunday.plusDays(1)).previous();
};
