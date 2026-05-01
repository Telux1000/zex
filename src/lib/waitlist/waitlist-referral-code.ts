import { randomBytes } from 'crypto';

/** Uppercase hex referral token (retry on unique violation in caller). */
export function generateWaitlistReferralCode(): string {
  return randomBytes(5).toString('hex').toUpperCase();
}
