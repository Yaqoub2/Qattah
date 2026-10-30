import "server-only";
import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";

export const OTP_TTL_MS = 10 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_DAILY_CAP = 5;

export const randomOtp = () => String(randomInt(100_000, 1_000_000));
export const hashOtp = (code: string) => bcrypt.hash(code, 8);
export const verifyOtpHash = (code: string, hash: string) => bcrypt.compare(code, hash);
