import { Client, Collection, ColorResolvable } from "discord.js";
import { ClientDataOptions, CustomClientOptions, BaseApplicationCommand } from "../interfaces/index.js";
import { Handler } from "./index.js";
import { Logger, logger } from "./Logger.js";
import { SwiggyAuth } from "../../utils/swiggyAuth.js";
import { OAuthCallbackServer } from "./OAuthCallbackServer.js";
import { startSupabaseKeepalive } from "../../utils/supabaseKeepalive.js";

export class CustomClient extends Client {
    commands: Collection<string, BaseApplicationCommand> = new Collection();
    data: ClientDataOptions;
    handlers: Handler = new Handler(this);
    logger: Logger = logger;
    color: ColorResolvable;
    swiggyAuth!: SwiggyAuth;
    oauthServer!: OAuthCallbackServer;

    constructor(options: CustomClientOptions) {
        super(options);
        this.data = options.data;
        this.color = options.data.color;
        this.setMaxListeners(20);
    }

    async start() {
        // Initialize Swiggy Auth (OAuth 2.1 + PKCE public client — no static
        // client identity; see docs/start/authenticate).
        const oauthCallbackUrl = process.env.OAUTH_CALLBACK_URL || "http://localhost:3000/auth/callback";

        this.swiggyAuth = new SwiggyAuth(oauthCallbackUrl);
        this.oauthServer = new OAuthCallbackServer(3000, this.swiggyAuth, this);
        this.oauthServer.start();

        // Free-plan Supabase auto-pauses after ~7d idle; a light periodic
        // query counts as activity. Never throws.
        startSupabaseKeepalive();

        // Register the process-level error traps and attach all event/command
        // listeners *before* logging in, so the `once` ClientReady handler is
        // guaranteed to be listening before the gateway fires ready.
        this.handlers.catchErrors();
        await this.handlers.loadEvents(this.data.handlers.events);
        await this.handlers.loadCommands(this.data.handlers.commands);

        await this.login(this.data.token);
    }
}
