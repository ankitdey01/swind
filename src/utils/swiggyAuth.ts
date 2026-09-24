import crypto from "node:crypto";
import { logger } from "../structure/classes/Logger.js";
import { decryptToken, encryptToken, validateTokenEncryptionKey } from "./tokenEncryption.js";
import { getSupabaseClient } from "./supabase.js";

interface TokenResponse {
    access_token: string;
    expires_in: number;
    scope?: string;
}

interface StoredToken {
    discord_user_id: string;
    encrypted_token: string;
    encrypted_key: string;
    expires_at: string;
    scope: string;
}

interface StoredOAuthState {
    state: string;
    discord_user_id: string;
    code_verifier: string;
    expires_at: string;
}

const SWIGGY_BASE = "https://mcp.swiggy.com";
const TOKEN_TABLE = "swiggy_auth_tokens";
const STATE_TABLE = "swiggy_oauth_states";
const STATE_EXPIRY_MS = 5 * 60 * 1000;

function getTokenEncryptionKey(): string {
    const key = process.env.TOKEN_ENCRYPTION_KEY;
    if (!key) {
        throw new Error(
            "TOKEN_ENCRYPTION_KEY is required. Generate one once and keep it only in the deployment environment or an untracked local .env file."
        );
    }
    return key;
}

function databaseError(operation: string, error: { message: string }): Error {
    return new Error(`${operation} failed: ${error.message}`);
}

export class SwiggyAuth {
    private callbackUrl: string;
    private clientId: string;

    constructor(callbackUrl: string, clientId?: string) {
        this.callbackUrl = callbackUrl;
        const resolvedClientId = clientId ?? process.env.SWIGGY_CLIENT_ID;
        if (!resolvedClientId) {
            throw new Error(
                "SWIGGY_CLIENT_ID is required. Register via POST /auth/register (DCR) or copy it into your .env file."
            );
        }
        this.clientId = resolvedClientId;

        // Fail at startup with an actionable message instead of discovering a
        // missing storage secret only after a user starts an OAuth flow.
        getSupabaseClient();
        const encryptionKey = getTokenEncryptionKey();
        validateTokenEncryptionKey(encryptionKey);
    }

    /** Generate PKCE code verifier and challenge. */
    generatePKCE() {
        const codeVerifier = crypto.randomBytes(32).toString("base64url");
        const codeChallenge = crypto
            .createHash("sha256")
            .update(codeVerifier)
            .digest("base64url");

        return { codeVerifier, codeChallenge };
    }

    /** Generate a state token for CSRF protection. */
    generateState(): string {
        return crypto.randomBytes(16).toString("hex");
    }

    /** Build the Swiggy OAuth authorization URL and persist its PKCE state. */
    async getAuthorizationUrl(userId: string): Promise<string> {
        const { codeVerifier, codeChallenge } = this.generatePKCE();
        const state = this.generateState();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + STATE_EXPIRY_MS);
        const supabase = getSupabaseClient();

        await this.cleanupExpiredState(now.toISOString());

        const { error } = await supabase.from(STATE_TABLE).insert({
            state,
            discord_user_id: userId,
            code_verifier: codeVerifier,
            created_at: now.toISOString(),
            expires_at: expiresAt.toISOString(),
        });
        if (error) throw databaseError("Saving OAuth state", error);

        const params = new URLSearchParams({
            response_type: "code",
            client_id: this.clientId,
            redirect_uri: this.callbackUrl,
            code_challenge: codeChallenge,
            code_challenge_method: "S256",
            state,
            scope: "mcp:tools mcp:resources mcp:prompts",
        });

        return `${SWIGGY_BASE}/auth/authorize?${params.toString()}`;
    }

    /** Exchange an authorization code for an encrypted, durable access token. */
    async exchangeCodeForToken(
        code: string,
        state: string
    ): Promise<{ accessToken: string; expiresIn: number; userId: string }> {
        await this.cleanupExpiredState(new Date().toISOString());
        const authState = await this.getAuthState(state);
        let exchangeCompleted = false;

        try {
            const response = await fetch(`${SWIGGY_BASE}/auth/token`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    grant_type: "authorization_code",
                    code,
                    code_verifier: authState.code_verifier,
                    redirect_uri: this.callbackUrl,
                }),
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Token exchange failed: ${response.status} - ${error}`);
            }

            const data = (await response.json()) as TokenResponse;
            const expiresAt = new Date(Date.now() + data.expires_in * 1000);
            const encrypted = encryptToken(data.access_token, getTokenEncryptionKey());
            const supabase = getSupabaseClient();

            const { error } = await supabase.from(TOKEN_TABLE).upsert(
                {
                    discord_user_id: authState.discord_user_id,
                    encrypted_token: encrypted.encryptedToken,
                    encrypted_key: encrypted.encryptedKey,
                    expires_at: expiresAt.toISOString(),
                    scope: data.scope || "",
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "discord_user_id" }
            );
            if (error) throw databaseError("Saving encrypted access token", error);

            exchangeCompleted = true;
            return {
                accessToken: data.access_token,
                expiresIn: data.expires_in,
                userId: authState.discord_user_id,
            };
        } finally {
            try {
                await this.removeAuthState(state);
            } catch (cleanupError) {
                if (exchangeCompleted) throw cleanupError;

                logger.error(
                    "Auth",
                    `Failed to clean up OAuth state after an exchange error: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`
                );
            }
        }
    }

    /** Get and decrypt a user's current access token. */
    async getAccessToken(userId: string): Promise<string | null> {
        try {
            const auth = await this.getStoredToken(userId);
            if (!auth) return null;

            if (Date.now() >= new Date(auth.expires_at).getTime()) {
                await this.removeAuth(userId);
                return null;
            }

            return decryptToken(
                {
                    encryptedToken: auth.encrypted_token,
                    encryptedKey: auth.encrypted_key,
                },
                getTokenEncryptionKey()
            );
        } catch (error) {
            logger.error("Auth", `Failed to get access token: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    /** Check if a user is authenticated and their encrypted token is valid. */
    async isAuthenticated(userId: string): Promise<boolean> {
        return (await this.getAccessToken(userId)) !== null;
    }

    /** Get time until token expires, in seconds. */
    async getTokenExpiry(userId: string): Promise<number | null> {
        try {
            const auth = await this.getStoredToken(userId);
            if (!auth) return null;

            const secondsRemaining = Math.floor((new Date(auth.expires_at).getTime() - Date.now()) / 1000);
            if (secondsRemaining > 0) return secondsRemaining;

            await this.removeAuth(userId);
            return null;
        } catch (error) {
            logger.error("Auth", `Failed to get token expiry: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    /** Revoke the token with Swiggy and remove the durable row. */
    async logout(userId: string): Promise<void> {
        let token: string | null = null;
        try {
            token = await this.getAccessToken(userId);
        } catch (error) {
            logger.error("Auth", `Failed to retrieve token during logout: ${error instanceof Error ? error.message : String(error)}`);
        }

        try {
            if (token) {
                await fetch(`${SWIGGY_BASE}/auth/logout`, {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                });
            }
        } catch (error) {
            logger.error("Auth", `Logout request failed: ${error instanceof Error ? error.message : String(error)}`);
        }

        await this.removeAuth(userId);
    }

    private async getStoredToken(userId: string): Promise<StoredToken | null> {
        const { data, error } = await getSupabaseClient()
            .from(TOKEN_TABLE)
            .select("discord_user_id, encrypted_token, encrypted_key, expires_at, scope")
            .eq("discord_user_id", userId)
            .maybeSingle();

        if (error) throw databaseError("Loading encrypted access token", error);
        return data as StoredToken | null;
    }

    private async getAuthState(state: string): Promise<StoredOAuthState> {
        const { data, error } = await getSupabaseClient()
            .from(STATE_TABLE)
            .select("state, discord_user_id, code_verifier, expires_at")
            .eq("state", state)
            .maybeSingle();

        if (error) throw databaseError("Loading OAuth state", error);

        const authState = data as StoredOAuthState | null;
        if (!authState || Date.now() >= new Date(authState.expires_at).getTime()) {
            if (authState) await this.removeAuthState(state);
            throw new Error("Invalid or expired state token");
        }

        return authState;
    }

    private async removeAuth(userId: string): Promise<void> {
        const { error } = await getSupabaseClient()
            .from(TOKEN_TABLE)
            .delete()
            .eq("discord_user_id", userId);

        if (error) throw databaseError("Removing encrypted access token", error);
    }

    private async removeAuthState(state: string): Promise<void> {
        const { error } = await getSupabaseClient()
            .from(STATE_TABLE)
            .delete()
            .eq("state", state);

        if (error) throw databaseError("Removing OAuth state", error);
    }

    private async cleanupExpiredState(now: string): Promise<void> {
        const { error } = await getSupabaseClient()
            .from(STATE_TABLE)
            .delete()
            .lt("expires_at", now);

        if (error) throw databaseError("Cleaning up expired OAuth state", error);
    }
}
