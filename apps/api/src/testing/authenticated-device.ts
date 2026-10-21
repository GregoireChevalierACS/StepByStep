import request from 'supertest';

type App = Parameters<typeof request>[0];

export interface AuthenticatedDevice {
  readonly accountId: string;
  readonly deviceId: string;
  readonly secret: string;
  /** Valeur de l'en-tête Authorization : `Bearer <jeton>`. */
  readonly authorization: string;
}

/**
 * Enregistre un appareil puis échange son secret contre un jeton, comme le fait l'app :
 * de quoi appeler les routes protégées dans les tests d'intégration.
 */
export const registerAuthenticatedDevice = async (app: App): Promise<AuthenticatedDevice> => {
  const registered = (await request(app).post('/v1/devices').expect(201)).body as {
    accountId: string;
    deviceId: string;
    secret: string;
  };
  const { token } = (
    await request(app)
      .post(`/v1/devices/${registered.deviceId}/tokens`)
      .send({ secret: registered.secret })
      .expect(200)
  ).body as { token: string };
  return { ...registered, authorization: `Bearer ${token}` };
};
