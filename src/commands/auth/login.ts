import { SlashCommandBuilder, EmbedBuilder, MessageFlags, ComponentType, ButtonStyle } from "discord.js";
import { SlashCommand } from "../../structure/index.js";
import { authNotConfiguredEmbed, formatExpiryShort } from "../../utils/authEmbeds.js";
import { isIgnorableInteractionError } from "../../structure/functions/discordErrors.js";

export default new SlashCommand({
    data: new SlashCommandBuilder()
        .setName("login")
        .setDescription("Authenticate with your Swiggy account"),
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
        // Defer first: Supabase I/O can take longer than Discord's ~3s
        // interaction window. A paused/slow database must not cause 10062.
        await interaction.deferReply({ ephemeral: true });

        // Check if user is already authenticated
        if (await client.swiggyAuth.isAuthenticated(interaction.user.id)) {
            const expiryText = formatExpiryShort(await client.swiggyAuth.getTokenExpiry(interaction.user.id));

            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor("Yellow")
                        .setTitle("⚠️ Already Authenticated")
                        .setDescription(`You're already logged in to Swiggy.`)
                        .addFields(
                            {
                                name: "Token Expires In",
                                value: expiryText,
                                inline: false
                            },
                            {
                                name: "Want to Re-authenticate?",
                                value: "Use `/logout` first, then run `/login` again.",
                                inline: false
                            }
                        )
                ],
            });
        }

        // Generate authorization URL
        const authUrl = await client.swiggyAuth.getAuthorizationUrl(interaction.user.id);
        if (!authUrl) {
            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor("Red")
                        .setTitle("❌ Error")
                        .setDescription("Failed to generate authentication URL. Please try again later.")
                ],
            });
        }

        return interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor("Blurple")
                    .setTitle("🔐 Swiggy Authentication")
                    .setDescription(
                        "Click the button below to authenticate with your Swiggy account. This will allow the bot to access your Swiggy data."
                    )
                    .addFields(
                        {
                            name: "Permissions Required",
                            value: "• Access Swiggy tools\n• Read resources\n• Use prompts",
                            inline: false
                        },
                        {
                            name: "Security",
                            value: "Your token is stored securely and never shared.",
                            inline: false
                        }
                    )
                    .setFooter({ text: "You will be redirected to Swiggy to complete authentication" })
            ],
            components: [
                {
                    type: ComponentType.ActionRow,
                    components: [
                        {
                            type: ComponentType.Button,
                            style: ButtonStyle.Link,
                            label: "Login with Swiggy",
                            url: authUrl
                        }
                    ]
                }
            ],
        });
        } catch (error) {
            if (isIgnorableInteractionError(error)) return;
            client.logger.error("AUTH", `Login failed: ${error instanceof Error ? error.message : String(error)}`);
            try {
                const payload = {
                    embeds: [
                        new EmbedBuilder()
                            .setColor("Red")
                            .setTitle("Login Failed")
                            .setDescription(
                                "An error occurred while starting authentication. The database may be temporarily unavailable (e.g. Supabase paused) — please try again in a minute."
                            )
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
