import { AsyncLocalStorage } from 'node:async_hooks';

interface RequestContext {
  readonly requestId: string;
}

/**
 * Contexte de la requête en cours, propagé par Node à travers tous les `await` de son
 * traitement : chaque ligne de journal peut y lire l'identifiant de la requête sans qu'on le
 * passe de fonction en fonction.
 */
const storage = new AsyncLocalStorage<RequestContext>();

export const runInRequestContext = <T>(context: RequestContext, work: () => T): T =>
  storage.run(context, work);

/** Identifiant de la requête en cours ; `undefined` hors requête (démarrage, jobs). */
export const currentRequestId = (): string | undefined => storage.getStore()?.requestId;
