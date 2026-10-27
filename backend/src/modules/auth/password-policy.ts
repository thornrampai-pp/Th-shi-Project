import { AppError } from '../../common/errors/AppError';

export const MIN_PASSWORD_LENGTH = 8;
/** bcrypt only reads the first 72 bytes; anything past that would silently not count. */
export const MAX_PASSWORD_BYTES = 72;

/** Applied wherever a password is set (register, changePassword) — never on login. */
export function assertPasswordPolicy(password: string): void {
  if ([...password].length < MIN_PASSWORD_LENGTH) {
    throw AppError.badRequest(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    throw AppError.badRequest(`Password is too long (max ${MAX_PASSWORD_BYTES} bytes)`);
  }
}
