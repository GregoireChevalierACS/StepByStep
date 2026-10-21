import { type ExecutionContext, HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { FORBIDDEN_PROBLEM_TYPE, UNAUTHENTICATED_PROBLEM_TYPE } from './auth-errors.js';
import { DeviceAuthGuard } from './device-auth.guard.js';
import { DeviceTokens } from './device-tokens.js';

const clock = { now: () => Date.parse('2026-10-20T08:00:00Z') };
const tokens = new DeviceTokens('une-clé-de-test-de-plus-de-32-caractères', clock);
const DEVICE = '6f1c2a3e-0000-4000-8000-000000000001';
const ACCOUNT = '6f1c2a3e-0000-4000-8000-000000000002';
const OTHER = '6f1c2a3e-0000-4000-8000-000000000003';

// Contexte HTTP minimal : en-têtes et paramètres de la requête, en-têtes posés sur la réponse.
const contextFor = (headers: Record<string, string>, params: Record<string, string>) => {
  const responseHeaders: Record<string, string> = {};
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ headers, params }),
      getResponse: () => ({
        setHeader: (name: string, value: string) => {
          responseHeaders[name] = value;
        },
      }),
    }),
  } as unknown as ExecutionContext; // Seules les méthodes utilisées par la garde sont fournies.
  return { context, responseHeaders };
};

const refusal = async (promise: Promise<boolean>) => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof HttpException)
      return { status: error.getStatus(), body: error.getResponse() };
  }
  throw new Error('La garde aurait dû refuser la requête');
};

const bearer = async (deviceId = DEVICE, accountId = ACCOUNT) =>
  `Bearer ${(await tokens.issue({ deviceId, accountId })).token}`;

describe('DeviceAuthGuard', () => {
  const guard = new DeviceAuthGuard(tokens);

  it('laisse passer le jeton de l’appareil de l’URL', async () => {
    const { context } = contextFor({ authorization: await bearer() }, { deviceId: DEVICE });

    expect(await guard.canActivate(context)).toBe(true);
  });

  it('laisse passer le jeton d’un appareil du compte de l’URL', async () => {
    const { context } = contextFor({ authorization: await bearer() }, { accountId: ACCOUNT });

    expect(await guard.canActivate(context)).toBe(true);
  });

  it('répond 401 sans jeton, et indique le schéma attendu (RFC 6750)', async () => {
    const { context, responseHeaders } = contextFor({}, { deviceId: DEVICE });

    expect(await refusal(guard.canActivate(context))).toMatchObject({
      status: 401,
      body: { type: UNAUTHENTICATED_PROBLEM_TYPE },
    });
    expect(responseHeaders['WWW-Authenticate']).toBe('Bearer');
  });

  it('répond 401 pour un autre schéma d’authentification ou un jeton invalide', async () => {
    for (const authorization of ['Basic dXNlcjpwYXNz', 'Bearer pas-un-jeton', 'Bearer ']) {
      const { context } = contextFor({ authorization }, { deviceId: DEVICE });

      expect(await refusal(guard.canActivate(context))).toMatchObject({ status: 401 });
    }
  });

  it('répond 403 quand le jeton est valide mais pour un autre appareil ou un autre compte', async () => {
    const otherDevice = contextFor({ authorization: await bearer() }, { deviceId: OTHER });
    const otherAccount = contextFor({ authorization: await bearer() }, { accountId: OTHER });

    for (const { context } of [otherDevice, otherAccount]) {
      expect(await refusal(guard.canActivate(context))).toMatchObject({
        status: 403,
        body: { type: FORBIDDEN_PROBLEM_TYPE },
      });
    }
  });

  it('refuse une route sans appareil ni compte dans l’URL plutôt que de tout autoriser', async () => {
    const { context } = contextFor({ authorization: await bearer() }, {});

    expect(await refusal(guard.canActivate(context))).toMatchObject({ status: 403 });
  });
});
