import { z } from 'zod';

const POSTGRES_URL = /^postgres(ql)?:\/\//;

/** Variables d'environnement de l'API : leur forme, leurs valeurs par défaut. */
const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // L'environnement ne contient que du texte : on convertit, puis on valide.
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: z.string().refine((url) => POSTGRES_URL.test(url) && URL.canParse(url), {
    message: 'URL PostgreSQL attendue : postgres://utilisateur:motdepasse@hôte:port/base',
  }),
  // Intervalle du relais de l'outbox (publication des événements) ; 0 le désactive (tests).
  OUTBOX_RELAY_INTERVAL_MS: z.coerce.number().int().min(0).default(5000),
});

export type Environment = z.infer<typeof environmentSchema>;

/**
 * Valide l'environnement au démarrage (« fail fast ») : renvoie une configuration typée,
 * ou lève une erreur qui liste toutes les variables invalides à la fois. Le message ne
 * contient jamais les valeurs reçues : DATABASE_URL contient un mot de passe.
 */
export const parseEnvironment = (env: Record<string, unknown>): Environment => {
  const result = environmentSchema.safeParse(env);
  if (result.success) return result.data;
  const problems = result.error.issues
    .map((issue) => `  - ${issue.path.join('.')} : ${issue.message}`)
    .join('\n');
  throw new Error(`Configuration invalide, l'API ne peut pas démarrer :\n${problems}`);
};
