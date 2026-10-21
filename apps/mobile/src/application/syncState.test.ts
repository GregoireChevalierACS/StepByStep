import { describe, expect, it } from 'vitest';

import { parseSyncState } from './syncState';

describe('parseSyncState', () => {
  it('relit l’appareil, son secret et le dernier fuseau envoyé', () => {
    expect(
      parseSyncState('{"deviceId":"d1","secret":"s1","lastSentTimeZone":"Europe/Paris"}'),
    ).toEqual({ deviceId: 'd1', secret: 's1', lastSentTimeZone: 'Europe/Paris' });
  });

  it('accepte un état sans fuseau encore confirmé', () => {
    expect(parseSyncState('{"deviceId":"d1","secret":"s1"}')).toEqual({
      deviceId: 'd1',
      secret: 's1',
    });
  });

  it('ignore un état d’avant l’authentification (sans secret) : l’app se réenregistrera', () => {
    expect(parseSyncState('{"deviceId":"d1","lastSentTimeZone":"Europe/Paris"}')).toBeUndefined();
  });

  it('ignore un état illisible ou mal formé', () => {
    for (const raw of ['', 'pas du json', 'null', '[]', '{"deviceId":1,"secret":"s1"}']) {
      expect(parseSyncState(raw)).toBeUndefined();
    }
  });

  it('ignore un fuseau qui n’est pas du texte', () => {
    expect(parseSyncState('{"deviceId":"d1","secret":"s1","lastSentTimeZone":2}')).toEqual({
      deviceId: 'd1',
      secret: 's1',
    });
  });
});
