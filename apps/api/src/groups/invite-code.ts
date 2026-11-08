import { randomBytes } from 'node:crypto';

/**
 * Nouveau code d'invitation : 128 bits d'un générateur cryptographique, en base64url (22
 * caractères, partageable par lien ou QR code). Le connaître suffit pour rejoindre le groupe :
 * il doit être impossible à deviner, comme un secret. Une collision est négligeable (2^-64
 * après des milliards de groupes) ; la contrainte d'unicité la refuserait de toute façon.
 */
export const newInviteCode = (): string => randomBytes(16).toString('base64url');
