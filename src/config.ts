import { ColorResolvable } from "discord.js";

const config = {
    token: process.env.DISCORD_TOKEN || "",
    developers: (process.env.DEVELOPER_IDS || "YOUR_DISCORD_USER_ID").split(","),
    handlers: {
        commands: "./dist/commands",
        events: "./dist/events"
    },
    color: "Blue" as ColorResolvable
};

function validateConfig() {
    // Debug: Log what we actually have
    console.log("🔍 Config Debug:");
    console.log(`   DISCORD_TOKEN: ${process.env.DISCORD_TOKEN ? "✓ set" : "✗ NOT SET"}`);
    console.log(`   DEVELOPER_IDS: ${process.env.DEVELOPER_IDS ? "✓ set" : "✗ NOT SET"}`);
    console.log(`   OPENROUTER_API_KEY: ${process.env.OPENROUTER_API_KEY ? "✓ set" : "✗ NOT SET"}`);
    console.log(`   OAUTH_CALLBACK_URL: ${process.env.OAUTH_CALLBACK_URL ? "✓ set" : "✗ NOT SET"}`);
    console.log(`   SUPABASE_URL: ${process.env.SUPABASE_URL ? "✓ set" : "✗ NOT SET"}`);
    
    const validDevelopers = config.developers
        .map((id) => id.trim())
        .filter((id) => id && id !== "YOUR_DISCORD_USER_ID");

    if (validDevelopers.length === 0) {
        console.warn(`⚠️  Warning: DEVELOPER_IDS not configured. Developer commands will not be available.`);
    }
}

validateConfig();

export default config;