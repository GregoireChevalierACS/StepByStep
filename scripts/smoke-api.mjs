// Smoke test de l'API compilée : démarre apps/api/dist/main.js comme en production,
// attend une réponse 200 sur /v1/health, puis l'arrête. Code de sortie 0 si l'API répond.
// Prérequis : `pnpm build`. Usage : `pnpm smoke:api` (fonctionne sous Linux et Windows).
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = process.env.SMOKE_PORT ?? '3999';
const URL_HEALTH = `http://127.0.0.1:${PORT}/v1/health`;
const TIMEOUT_MS = 30_000;

const api = spawn(process.execPath, ['apps/api/dist/main.js'], {
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT,
    // L'URL doit seulement être bien formée : la sonde de santé ne contacte pas la base.
    DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://smoke:smoke@127.0.0.1:5432/smoke',
  },
  stdio: ['ignore', 'inherit', 'inherit'],
});

let exited = false;
api.on('exit', () => {
  exited = true;
});

const waitForHealth = async () => {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline && !exited) {
    try {
      const response = await fetch(URL_HEALTH);
      if (response.ok) return await response.json();
    } catch {
      // L'API ne répond pas encore : on réessaie.
    }
    await sleep(500);
  }
  return undefined;
};

const body = await waitForHealth();
api.kill();

if (body === undefined) {
  console.error(`✖ L'API compilée ne répond pas sur ${URL_HEALTH} (arrêtée ou délai dépassé).`);
  process.exit(1);
}
console.log(`✔ L'API compilée répond sur ${URL_HEALTH} : ${JSON.stringify(body)}`);
