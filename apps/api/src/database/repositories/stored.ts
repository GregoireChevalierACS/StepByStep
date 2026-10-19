import type { Result } from '@stepbystep/domain';

/**
 * Valeur relue en base et revalidée par le domaine. Un échec n'est pas une erreur métier mais
 * une incohérence de données : erreur serveur explicite (500), jamais une donnée invalide
 * renvoyée au client.
 */
export const stored = <T>(result: Result<T, unknown>): T => {
  if (!result.ok) throw new Error(`Donnée enregistrée invalide : ${JSON.stringify(result.error)}`);
  return result.value;
};
