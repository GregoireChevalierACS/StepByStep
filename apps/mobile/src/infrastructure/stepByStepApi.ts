/**
 * Adresse de l'API vue depuis le téléphone. En développement, `adb reverse tcp:3000 tcp:3000`
 * redirige le port 3000 du téléphone vers celui du PC à travers ADB Wi-Fi : aucune IP codée en
 * dur, aucune règle de pare-feu. Le trafic HTTP en clair n'est autorisé que dans le build debug.
 */
const API_URL = 'http://localhost:3000';

export interface ApiResponse {
  readonly status: number;
  readonly body: unknown;
}

async function toApiResponse(response: Response): Promise<ApiResponse> {
  const text = await response.text();
  return { status: response.status, body: text === '' ? null : (JSON.parse(text) as unknown) };
}

export async function checkHealth(): Promise<ApiResponse> {
  return toApiResponse(await fetch(`${API_URL}/v1/health`));
}
