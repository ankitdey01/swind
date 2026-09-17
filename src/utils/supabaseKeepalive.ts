import { getSupabaseClient } from "./supabase.js";
import { logger } from "../structure/classes/Logger.js";

export const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h — comfortably above "a few queries per day"
export const MIN_INTERVAL_MS = 30 * 60 * 1000; // 30m — avoid accidental hot loops
export const MAX_INTERVAL_MS = 2147483647; // Node.js maximum timer delay (~24.8d); larger values overflow to 1ms
const STARTUP_DELAY_MS = 60 * 1000; // let boot/login finish first

let timer: NodeJS.Timeout | undefined;

async function ping(): Promise<void> {
    try {
        // HEAD-only count query: real DB activity for pause prevention
        // without transferring any row data.
        const { error } = await getSupabaseClient()
            .from("swiggy_auth_tokens")
            .select("discord_user_id", { count: "exact", head: true });
        if (error) throw new Error(error.message);
        logger.debug("Supabase", "Keepalive ping ok");
    } catch (error) {
        // Never throw — a paused/down DB must not crash the bot.
        logger.warn("Supabase", `Keepalive ping failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Resolve the heartbeat interval from the raw env value. Pure (no timers),
 * so the default / clamp behavior is unit-testable.
 */
export function resolveKeepaliveIntervalMs(raw: string | undefined): number {
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0
        ? Math.min(Math.max(parsed, MIN_INTERVAL_MS), MAX_INTERVAL_MS)
        : DEFAULT_INTERVAL_MS;
}

/**
 * Keeps a Free-plan Supabase project from auto-pausing (7 days idle).
 * In-process only: works while the bot is running. Pro plan is the only
 * guaranteed prevention.
 */
export function startSupabaseKeepalive(): NodeJS.Timeout | undefined {
    if (timer) return timer;
    if (process.env.SUPABASE_KEEPALIVE_DISABLED === "true") {
        logger.warn("Supabase", "Keepalive disabled via SUPABASE_KEEPALIVE_DISABLED");
        return undefined;
    }

    const intervalMs = resolveKeepaliveIntervalMs(process.env.SUPABASE_KEEPALIVE_INTERVAL_MS);

    const run = () => {
        void ping();
    };

    // First ping shortly after boot, then on interval. unref() so the
    // timer alone never keeps the process alive.
    const startupTimeout = setTimeout(run, STARTUP_DELAY_MS);
    if (typeof startupTimeout.unref === "function") startupTimeout.unref();

    timer = setInterval(run, intervalMs);
    if (typeof timer.unref === "function") timer.unref();

    logger.debug("Supabase", `Keepalive started (every ${Math.round(intervalMs / 3600000)}h)`);
    return timer;
}
