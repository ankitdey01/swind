import { EmbedBuilder } from "discord.js";

/**
 * Shared presentation for the Swiggy auth commands (`/login`, `/logout`,
 * `/authstatus`). The "not configured" guard and the token-expiry formatting
 * were previously copy-pasted across all three commands; they live here so the
 * copy and the time math stay in one place.
 */

const SECONDS_PER_DAY = 86_400;
const SECONDS_PER_HOUR = 3_600;

/** Embed shown when Swiggy auth is unavailable (defensive; auth is always initialized at startup). */
export function authNotConfiguredEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor("Red")
    .setTitle("❌ Auth Not Configured")
    .setDescription("Swiggy authentication is not yet configured. Please check with the bot administrator.");
}

/**
 * Short, human-friendly expiry used by `/login` — e.g. `"<1 day"`, `"1 day"`,
 * `"5 days"`. Returns `"unknown"` for a missing or non-positive value.
 */
export function formatExpiryShort(secondsRemaining: number | null | undefined): string {
  if (typeof secondsRemaining !== "number" || !Number.isFinite(secondsRemaining) || secondsRemaining <= 0) {
    return "unknown";
  }

  const days = Math.floor(secondsRemaining / SECONDS_PER_DAY);
  if (days === 0) return "<1 day";
  return `${days} day${days === 1 ? "" : "s"}`;
}

/**
 * Detailed expiry used by `/authstatus` — e.g. `"5 days and 3 hours"`.
 */
export function formatExpiryDetailed(secondsRemaining: number): string {
  const days = Math.floor(secondsRemaining / SECONDS_PER_DAY);
  const hours = Math.floor((secondsRemaining % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
  return `${days} days and ${hours} hours`;
}
