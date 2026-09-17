import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import { SlashCommand } from "../../structure/index.js";
import { authNotConfiguredEmbed, formatExpiryDetailed } from "../../utils/authEmbeds.js";
import { isIgnorableInteractionError } from "../../structure/functions/discordErrors.js";

export default new SlashCommand({
    data: new SlashCommandBuilder()
        .setName("authstatus")
        .setDescription("Check your Swiggy authentication status"),
    category: "Auth",
    async execute(interaction, client) {
        // Check if Swiggy auth is initialized
        if (!client.swiggyAuth) {
            return interaction.reply({
                embeds: [authNotConfiguredEmbed()],
                flags: MessageFlags.Ephemeral
            });
        }

        try {
            // Defer first so slow/paused Supabase doesn't expire the interaction (10062).
            await interaction.deferReply({ ephemeral: true });

            const isAuthenticated = await client.swiggyAuth.isAuthenticated(interaction.user.id);

            if (!isAuthenticated) {
                return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor("Yellow")
                        .setTitle("🔓 Not Authenticated")
                        .setDescription("You're not currently logged in to Swiggy.")
                        .addFields({
                            name: "Next Steps",
                            value: "Run `/login` to connect your Swiggy account.",
                            inline: false
                        })
                ],
            });
        }

        const expiry = await client.swiggyAuth.getTokenExpiry(interaction.user.id);
        if (!expiry) {
            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor("Red")
                        .setTitle("❌ Error")
                        .setDescription("Unable to retrieve token expiry information."),
                ],
            });
        }
        return interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor("Green")
                    .setTitle("🔐 Authenticated")
                    .setDescription(`You're successfully logged in to Swiggy.`)
                    .addFields({
                        name: "Token Status",
                        value: "✓ Valid and active",
                        inline: false
                    })
                    .addFields({
                        name: "Expires In",
                        value: formatExpiryDetailed(expiry),
                        inline: false
                    })
                    .addFields({
                        name: "Available Scopes",
                        value: "• `mcp:tools` - Access Swiggy tools\n• `mcp:resources` - Read resources\n• `mcp:prompts` - Use prompts",
                        inline: false
                    })
                    .addFields({
                        name: "Want to logout?",
                        value: "Run `/logout` to disconnect your account.",
                        inline: false
                    })
                    .setFooter({ text: "Token will auto-refresh when needed" })
            ],
        });
        } catch (error) {
            if (isIgnorableInteractionError(error)) return;
            client.logger.error("AUTH", `Authstatus failed: ${error instanceof Error ? error.message : String(error)}`);
            try {
                const payload = {
                    embeds: [
                        new EmbedBuilder()
                            .setColor("Red")
                            .setTitle("❌ Error")
                            .setDescription("Unable to check authentication status. The database may be temporarily unavailable — please try again in a minute."),
                    ],
                };
                if (interaction.deferred || interaction.replied) {
                    return await interaction.editReply(payload);
                }
                return await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
            } catch (replyError) {
                if (!isIgnorableInteractionError(replyError)) throw replyError;
            }
        }
    }
});
