import bcrypt from "bcryptjs";

export function randomOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function hashOtp(code: string): Promise<string> {
  return bcrypt.hash(code, 8);
}

export async function verifyOtpHash(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(code, hash);
}

export const OTP_MAX_ATTEMPTS = 8;
export const OTP_DAILY_SEND_CAP = 3;
