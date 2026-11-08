import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;

/**
 * Hash bcrypt cost 12 d'une chaîne dummy — jamais un mot de passe réel.
 * Sert uniquement à égaliser le timing des logins « e-mail inconnu ».
 */
export const DUMMY_PASSWORD_HASH =
  '$2b$12$/QxwJVHnKmeOF9DHnQ53MuXPJdxP6dg8vgrQ6gBY8MqcZcTwxE/dK';

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(plain, passwordHash);
}

/** Compare contre le hash dummy (résultat ignoré, coût bcrypt conservé). */
export async function verifyPasswordAgainstDummy(plain: string): Promise<void> {
  await bcrypt.compare(plain, DUMMY_PASSWORD_HASH);
}
