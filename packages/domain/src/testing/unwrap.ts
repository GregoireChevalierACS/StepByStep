import type { Result } from '../shared/Result';

// Réservé aux tests : un Result en échec y est un bug du test, pas un cas métier.
export const unwrap = <T, E>(result: Result<T, E>): T => {
  if (!result.ok) {
    throw new Error(`Result en succès attendu, erreur reçue : ${JSON.stringify(result.error)}`);
  }
  return result.value;
};
