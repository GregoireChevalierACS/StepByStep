import { err, ok, type Result } from '../shared/Result';

export interface InvalidNickname {
  readonly kind: 'InvalidNickname';
  readonly value: string;
  readonly reason: 'Length' | 'Characters';
}

const MIN_LENGTH = 3;
const MAX_LENGTH = 20;
// Lettres et chiffres de toutes les écritures (avec leurs accents combinants), espace, point,
// tiret bas, tiret et apostrophe ; un début par une lettre ou un chiffre. Ni balise, ni
// caractère de contrôle, ni émoji : un pseudo s'affiche tel quel chez les autres membres.
const ALLOWED = /^[\p{L}\p{N}][\p{L}\p{M}\p{N} ._'-]*$/u;
// Espaces typographiques (espace, insécable…), pas les retours à la ligne ni les tabulations.
const SPACES = /\p{Zs}+/gu;

/**
 * Pseudo du compte, affiché aux membres de ses groupes. Normalisé à la création (forme Unicode
 * NFC, espaces regroupés et retirés aux extrémités) : deux saisies qui s'affichent pareil
 * donnent le même pseudo. Longueur comptée en points de code, pas en unités UTF-16.
 */
export class Nickname {
  private constructor(readonly value: string) {}

  static create(value: string): Result<Nickname, InvalidNickname> {
    const normalized = value.normalize('NFC').replace(SPACES, ' ').replace(/^ | $/g, '');
    // Points de code, pas caractères visibles (graphèmes) : Intl.Segmenter n'est pas garanti
    // sur Hermes (React Native), et le compte doit être identique sur le téléphone et le
    // serveur. Après NFC, et sans émoji (refusés), les deux comptes coïncident en pratique.
    // eslint-disable-next-line @typescript-eslint/no-misused-spread
    const length = [...normalized].length;
    if (length < MIN_LENGTH || length > MAX_LENGTH) {
      return err({ kind: 'InvalidNickname', value, reason: 'Length' });
    }
    if (!ALLOWED.test(normalized)) {
      return err({ kind: 'InvalidNickname', value, reason: 'Characters' });
    }
    return ok(new Nickname(normalized));
  }
}
