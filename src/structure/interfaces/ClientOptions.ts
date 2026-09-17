import { ClientOptions, ColorResolvable } from "discord.js";

export interface CustomClientOptions extends ClientOptions {
    data: ClientDataOptions;
}

export interface ClientDataOptions {
    handlers: HandlersOptions;
    token: string;
    color: ColorResolvable;
    developers?: string[];
}

export interface HandlersOptions {
    commands: string;
    events: string;
}
