import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import { SlashCommand } from "../../structure/index.js";
import { authNotConfiguredEmbed } from "../../utils/authEmbeds.js";
import { isIgnorableInteractionError } from "../../structure/functions/discordErrors.js";

export default new SlashCommand({
    data: new SlashCommandBuilder()
        .setName("logout")
        .setDescription("Disconnect your Swiggy account from the Discord bot"),
    category: "Auth",
    async execute(interaction, client) {
        // Check if Swiggy auth is initialized
        if (!client.swiggyAuth) {
            return interaction.reply({
                embeds: [authNotConfiguredEmbed()],
                flags: MessageFlags.Ephemeral
            });
        }

        // Defer first so slow/paused Supabase doesn't expire the interaction (10062).
        try {
            await interaction.deferReply({ ephemeral: true });
        } catch (error) {
            if (isIgnorableInteractionError(error)) return;
            throw error;
        }

        try {
            // Check if user is authenticated
            if (!(await client.swiggyAuth.isAuthenticated(interaction.user.id))) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor("Yellow")
                            .setTitle("⚠️ Not Authenticated")
                            .setDescription("You're not currently logged in to Swiggy.")
                            .addFields({
                                name: "Want to login?",
                                value: "Use `/login` to authenticate with your Swiggy account.",
                                inline: false
                            })
                    ],
                });
            }

            // Logout and revoke token
            await client.swiggyAuth.logout(interaction.user.id);

            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor("Green")
                        .setTitle("✓ Logged Out")
                        .setDescription("Your Swiggy account has been disconnected from the Discord bot.")
                        .addFields({
                            name: "What happens now?",
                            value: "Your access token has been revoked. You can login again anytime with `/login`.",
                            inline: false
                        })
                ],
            });
        } catch (error) {
            if (isIgnorableInteractionError(error)) return;
            const details = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
            client.logger.error("AUTH", `Logout failed for user ${interaction.user.id}: ${details}`);

            try {
                const payload = {
                    embeds: [
                        new EmbedBuilder()
                            .setColor("Red")
                            .setTitle("❌ Logout Failed")
                            .setDescription("An error occurred while logging out. The database may be temporarily unavailable — please try again in a minute.")
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
