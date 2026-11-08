// Règles communes aux noms affichés chez les autres utilisateurs (pseudo, nom de groupe).

// Lettres et chiffres de toutes les écritures (avec leurs accents combinants), espace, point,
// tiret bas, tiret et apostrophe ; un début par une lettre ou un chiffre. Ni balise, ni
// caractère de contrôle, ni émoji : le nom s'affiche tel quel chez les autres.
const ALLOWED = /^[\p{L}\p{N}][\p{L}\p{M}\p{N} ._'-]*$/u;
// Espaces typographiques (espace, insécable…), pas les retours à la ligne ni les tabulations.
const SPACES = /\p{Zs}+/gu;

export type DisplayNameProblem = 'Length' | 'Characters';

/**
 * Normalise un nom affiché (forme Unicode NFC, espaces regroupés et retirés aux extrémités) :
 * deux saisies qui s'affichent pareil donnent le même nom. Renvoie le nom normalisé, ou la
 * raison du refus. Longueur comptée en points de code, pas en unités UTF-16.
 */
export const normalizeDisplayName = (
  value: string,
  minLength: number,
  maxLength: number,
):
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly reason: DisplayNameProblem } => {
  const normalized = value.normalize('NFC').replace(SPACES, ' ').replace(/^ | $/g, '');
  // Points de code, pas caractères visibles (graphèmes) : Intl.Segmenter n'est pas garanti
  // sur Hermes (React Native), et le compte doit être identique sur le téléphone et le
  // serveur. Après NFC, et sans émoji (refusés), les deux comptes coïncident en pratique.
  // eslint-disable-next-line @typescript-eslint/no-misused-spread
  const length = [...normalized].length;
  if (length < minLength || length > maxLength) return { ok: false, reason: 'Length' };
  if (!ALLOWED.test(normalized)) return { ok: false, reason: 'Characters' };
  return { ok: true, value: normalized };
};
