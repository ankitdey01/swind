import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, EmbedBuilder, InteractionEditReplyOptions, SlashCommandBuilder } from "discord.js";
import { paginate, SlashCommand } from "../../structure/index.js";
import { getSwiggyAccessToken, normalizeSwiggyOrderCount } from "../../utils/swiggyMcp.js";
import { classifySwiggyError } from "../../utils/swiggyErrors.js";
import {
  buildInstamartCartEmbed,
  clearInstamartCart,
  getInstamartCart,
  getExtractedInstamartCartItems,
  StoreClosedError,
} from "../../utils/instamartCart.js";
import { swiggyTools } from "../../utils/swiggyTools.js";
import { dataOf, escapeInline, escapeMarkdown, isRecord, text } from "../../utils/payload.js";
import {
  assertToolSuccess,
  extractInstamartOrders,
  extractMostOrderedItems,
  extractSearchProducts,
} from "../../utils/swiggyPayload.js";
import {
  buildInstamartAddressActions,
  buildInstamartAddressEmbed,
  buildInstamartHistoryEmbeds,
  buildInstamartSearchEmbeds,
  buildMostOrderedEmbeds,
  buildProductAddedEmbed,
  buildInstamartOrderDetailsEmbed,
  buildCheckoutEmbed,
  buildTrackOrderEmbed,
} from "../../utils/instamartEmbeds.js";

type CartItemInput = { spinId: string; quantity: number };

async function getInstamartAddresses(accessToken: string) {
  const result = await swiggyTools.instamart.getAddresses(accessToken);
  assertToolSuccess(result, "get_addresses");
  return result;
}

function toCartInputs(items: { spinId: string; quantity: number }[]): CartItemInput[] {
  return items.map(({ spinId, quantity }) => ({ spinId, quantity }));
}

export default new SlashCommand({
  data: new SlashCommandBuilder()
    .setName("instamart")
    .setDescription("Manage Swiggy Instamart")
    .addSubcommandGroup((group) =>
      group
        .setName("cart")
        .setDescription("Manage your Instamart cart")
        .addSubcommand((subcommand) =>
          subcommand.setName("show").setDescription("Show your current Instamart cart")
        )
        .addSubcommand((subcommand) =>
          subcommand.setName("clear").setDescription("Clear your Instamart cart")
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("add")
            .setDescription("Add a product to your Instamart cart")
            .addStringOption((option) =>
              option
                .setName("address-id")
                .setDescription("Address ID from /instamart address")
                .setRequired(true)
            )
            .addStringOption((option) =>
              option
                .setName("product-id")
                .setDescription("Product ID to add")
                .setRequired(true)
            )
            .addIntegerOption((option) =>
              option
                .setName("quantity")
                .setDescription("Quantity to add (default: 1)")
                .setMinValue(1)
                .setMaxValue(100)
            )
        )
    )
    .addSubcommandGroup((group) =>
      group
        .setName("coupon")
        .setDescription("Find and apply Instamart coupons")
        .addSubcommand((subcommand) =>
          subcommand
            .setName("find")
            .setDescription("Find coupons available for your Instamart cart")
            .addStringOption((option) =>
              option
                .setName("address-id")
                .setDescription("Delivery address ID from /instamart address")
                .setRequired(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("apply")
            .setDescription("Apply a coupon to your current Instamart cart")
            .addStringOption((option) =>
              option
                .setName("code")
                .setDescription("Coupon code")
                .setRequired(true)
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("address").setDescription("Show and manage your saved Instamart addresses")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("history")
        .setDescription("Show your recent Instamart order history")
        .addIntegerOption((option) =>
          option
            .setName("count")
            .setDescription("Number of orders to fetch, max 20")
            .setMinValue(1)
            .setMaxValue(20)
        )
        .addBooleanOption((option) =>
          option
            .setName("active-only")
            .setDescription("Show only active or ongoing orders")
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("most-ordered")
        .setDescription("Show your most ordered Instamart items for a saved address")
        .addStringOption((option) =>
          option
            .setName("address-id")
            .setDescription("Address ID from /instamart address")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("search")
        .setDescription("Search Instamart products for a saved address")
        .addStringOption((option) =>
          option
            .setName("address-id")
            .setDescription("Address ID from /instamart address")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("product")
            .setDescription("Product name, category, or brand to search")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("track-order")
        .setDescription("Track your Instamart order")
        .addIntegerOption((option) =>
          option
            .setName("order-id")
            .setDescription("Order ID to track")
            .setRequired(true)
            .setMinValue(100000000000000).setMaxValue(999999999999999)
        )
        .addIntegerOption((option) =>
          option
            .setName("lat")
            .setDescription("Latitude of delivery address")
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName("lng")
            .setDescription("Longitude of delivery address")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("checkout")
        .setDescription("Place an order from your cart")
        .addStringOption((option) =>
          option
            .setName("address-id")
            .setDescription("Delivery address ID")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("payment-method")
            .setDescription("Payment method (COD or UPI)")
            .setRequired(true)
            .addChoices(
              { name: "Cash on Delivery", value: "COD" },
              { name: "UPI QR Code", value: "UPI" }
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("order-details")
        .setDescription("Get detailed information about an order")
        .addStringOption((option) =>
          option
            .setName("order-id")
            .setDescription("Order ID to view details")
            .setRequired(true)
        )
    ),
  category: "Swiggy",

  async execute(interaction, client) {
    try {
      // Defer BEFORE any Supabase/MCP I/O so a slow or paused database
      // never expires the interaction (10062 "application did not respond").
      // Checkout stays ephemeral; everything else stays public like before.
      const group = interaction.options.getSubcommandGroup(false);
      const subcommandName = interaction.options.getSubcommand(false);
      if (!interaction.deferred && !interaction.replied) {
        if (group === null && subcommandName === "checkout") {
          await interaction.deferReply({ ephemeral: true });
        } else {
          await interaction.deferReply();
        }
      }

      const accessToken = await getSwiggyAccessToken(client, interaction.user.id);
      if (!accessToken) {
        return interaction.editReply("Use `/login` to connect your Swiggy account before managing Instamart.");
      }

      const subcommand = interaction.options.getSubcommand();
      const groupName = interaction.options.getSubcommandGroup(false);

      if (groupName === "coupon") {

        if (subcommand === "find") {
          const addressId = interaction.options.getString("address-id", true).trim();
          const result = await swiggyTools.instamart.listCoupons(accessToken, { addressId });
          assertToolSuccess(result, "list_coupons");
          return interaction.editReply({ embeds: [buildCouponsEmbed(result, addressId)] });
        }

        if (subcommand === "apply") {
          const couponCode = interaction.options.getString("code", true).trim();
          const result = await swiggyTools.instamart.applyCoupon(accessToken, { couponCode });
          assertToolSuccess(result, "apply_coupon");
          return interaction.editReply({ embeds: [buildCouponAppliedEmbed(result, couponCode)] });
        }
      }

      if (subcommand === "show") {
        const cart = await getInstamartCart(accessToken);

        if (checkResultMessage(cart)) {
          return interaction.editReply({ embeds: [buildResultMessageEmbed(cart)] });
        }

        return interaction.editReply({ embeds: [buildInstamartCartEmbed(cart)] });
      }

      if (subcommand === "clear") {
        const result = await clearInstamartCart(accessToken);

        if (checkResultMessage(result)) {
          return interaction.editReply({ embeds: [buildResultMessageEmbed(result)] });
        }

        return interaction.editReply("Your Instamart cart has been cleared.");
      }

      if (subcommand === "add") {
        return addToCart(interaction, accessToken);
      }

      if (subcommand === "address") {
        const addresses = await getInstamartAddresses(accessToken);

        if (checkResultMessage(addresses)) {
          return interaction.editReply({ embeds: [buildResultMessageEmbed(addresses)] });
        }

        return interaction.editReply({
          embeds: [buildInstamartAddressEmbed(addresses)],
          components: [buildInstamartAddressActions()],
        });
      }

      if (subcommand === "history") {
        const count = normalizeSwiggyOrderCount(interaction.options.getInteger("count"));
        const activeOnly = interaction.options.getBoolean("active-only") ?? false;
        const result = await swiggyTools.instamart.getOrders(accessToken, { count, orderType: "DASH", activeOnly });

        if (checkResultMessage(result)) {
          return interaction.editReply({ embeds: [buildResultMessageEmbed(result)] });
        }

        assertToolSuccess(result, "get_orders");

        const orders = extractInstamartOrders(result).slice(0, 20);
        return paginate(interaction, buildInstamartHistoryEmbeds(orders, count));
      }

      if (subcommand === "most-ordered") {
        const addressId = interaction.options.getString("address-id", true).trim();
        const result = await swiggyTools.instamart.yourGoToItems(accessToken, { addressId });

        if (checkResultMessage(result)) {
          return interaction.editReply({ embeds: [buildResultMessageEmbed(result)] });
        }

        assertToolSuccess(result, "your_go_to_items");

        const items = extractMostOrderedItems(result);
        return paginate(interaction, buildMostOrderedEmbeds(items, addressId));
      }

      if (subcommand === "search") {
        const addressId = interaction.options.getString("address-id", true).trim();
        const product = interaction.options.getString("product", true).trim();
        const result = await swiggyTools.instamart.searchProducts(accessToken, { addressId, query: product });

        if (checkResultMessage(result)) {
          return interaction.editReply({ embeds: [buildResultMessageEmbed(result)] });
        }

        assertToolSuccess(result, "search_products");

        const products = extractSearchProducts(result);
        const nextOffset = text(dataOf(result), ["nextOffset"]);
        return paginate(interaction, buildInstamartSearchEmbeds(products, addressId, product, nextOffset || undefined));
      }

      if (subcommand === "track-order") {
        const orderId = String(interaction.options.getInteger("order-id", true));
        const lat = interaction.options.getInteger("lat", true);
        const lng = interaction.options.getInteger("lng", true);

        const result = await swiggyTools.instamart.trackOrder(accessToken, { orderId, lat, lng });

        if (checkResultMessage(result)) {
          return interaction.editReply({ embeds: [buildResultMessageEmbed(result)] });
        }

        assertToolSuccess(result, "track_order");
        return interaction.editReply({ embeds: [buildTrackOrderEmbed(result)] });
      }

      if (subcommand === "checkout") {
        const addressId = interaction.options.getString("address-id", true).trim();
        const paymentChoice = interaction.options.getString("payment-method", true).toUpperCase();

        const paymentMethod = paymentChoice === "COD" ? "Cash" : "UPI";
        const result = await swiggyTools.instamart.checkout(accessToken, { addressId, paymentMethod });

        if (checkResultMessage(result)) {
          return interaction.editReply({ embeds: [buildResultMessageEmbed(result)] });
        }

        assertToolSuccess(result, "checkout");

        const embed = buildCheckoutEmbed(result, paymentChoice);
        const replyOptions: InteractionEditReplyOptions = { embeds: [embed] };

        // Add payment button for UPI
        if (paymentChoice === "UPI") {
          let bridgeUrl = text(dataOf(result), ["bridgeUrl"]); //"paymentUrl", "upiUrl"
          if (bridgeUrl) {
            if(!bridgeUrl.endsWith("&mode=qr") && !bridgeUrl.endsWith("?mode=qr")){
              bridgeUrl += "&mode=qr";
            }
            const button = new ButtonBuilder()
              .setLabel("Click here to pay")
              .setStyle(ButtonStyle.Link)
              .setURL(bridgeUrl);

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);
            replyOptions.components = [row];
          }
        }

        return interaction.editReply(replyOptions);
      }

      if (subcommand === "order-details") {
        const orderId = interaction.options.getString("order-id", true).trim();
        const result = await swiggyTools.instamart.getOrderDetails(accessToken, { orderId });

        if (checkResultMessage(result)) {
          return interaction.editReply({ embeds: [buildResultMessageEmbed(result)] });
        }

        assertToolSuccess(result, "get_order_details");
        return interaction.editReply({ embeds: [buildInstamartOrderDetailsEmbed(result)] });
      }

      return interaction.editReply("Unknown Instamart action.");
    } catch (error) {
      return handleInstamartError(interaction, error);
    }
  },
});

async function addToCart(
  interaction: ChatInputCommandInteraction,
  accessToken: string
): Promise<unknown> {
  const addressId = interaction.options.getString("address-id", true).trim();
  const spinId = interaction.options.getString("product-id", true).trim();
  const quantity = interaction.options.getInteger("quantity") ?? 1;

  const currentItems = getExtractedInstamartCartItems(await getInstamartCart(accessToken));
  const originalItems = toCartInputs(currentItems);

  const existingIndex = currentItems.findIndex((item) => item.spinId === spinId);
  const newItems: CartItemInput[] =
    existingIndex >= 0
      ? originalItems.map((item, index) =>
        index === existingIndex ? { ...item, quantity: item.quantity + quantity } : item
      )
      : [...originalItems, { spinId, quantity }];

  const updateResult = await swiggyTools.instamart.updateCart(accessToken, {
    selectedAddressId: addressId,
    items: newItems,
  });

  if (checkResultMessage(updateResult)) {
    return interaction.editReply({ embeds: [buildResultMessageEmbed(updateResult)] });
  }

  if (isPartiallyAvailableError(updateResult)) {
    await swiggyTools.instamart.updateCart(accessToken, { selectedAddressId: addressId, items: originalItems });

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff9800)
          .setAuthor({ name: "Swiggy Instamart" })
          .setTitle("⚠️ Item Quantity Partially Available")
          .setDescription("Item quantity is partially available, please reduce Quantity.")
          .setTimestamp(),
      ],
    });
  }

  assertToolSuccess(updateResult, "update_cart");

  const addedItem = getExtractedInstamartCartItems(await getInstamartCart(accessToken)).find((item) => item.spinId === spinId);
  if (addedItem) {
    return interaction.editReply({ embeds: [buildProductAddedEmbed(addedItem, quantity, addressId)] });
  }

  return interaction.editReply(`Product with ID \`${escapeInline(spinId)}\` has been added to your cart.`);
}

function isPartiallyAvailableError(result: unknown): boolean {
  if (!isRecord(result) || result.success !== false) return false;
  const message = isRecord(result.error) ? result.error.message : undefined;
  return typeof message === "string" && message.toLowerCase().includes("partially available");
}

function checkResultMessage(result: unknown): boolean {
  const data = dataOf(result);
  const message = text(data, ["message"]);
  return Boolean(message);
}

function buildResultMessageEmbed(result: unknown): EmbedBuilder {
  const data = dataOf(result);
  const message = text(data, ["message"]) || "Operation completed";

  return new EmbedBuilder()
    .setColor(0xff9800)
    .setAuthor({ name: "Swiggy Instamart" })
    .setTitle("ℹ️ Information")
    .setDescription(escapeMarkdown(message))
    .setTimestamp();
}

function buildCouponsEmbed(result: unknown, addressId: string): EmbedBuilder {
  const data = dataOf(result);
  const coupons = Array.isArray(data?.availableCoupons) ? data.availableCoupons : [];

  if (!coupons.length) {
    return new EmbedBuilder()
      .setColor(0xff5200)
      .setAuthor({ name: "Swiggy Instamart" })
      .setTitle("🎟️ Instamart Coupons")
      .setDescription("No coupons are available for your current cart and address.")
      .setFooter({ text: `Address ${addressId}` })
      .setTimestamp();
  }

  const lines = coupons.slice(0, 15).map((coupon: any) => {
    const code = text(coupon, ["couponCode", "code"]) || "Unknown";
    const title = text(coupon, ["title", "name"]);
    const description = text(coupon, ["description", "details"]);
    const status = text(coupon, ["applicabilityStatus", "status"]) || "UNKNOWN";
    const statusEmoji = status === "APPLIED" ? "✅" : status === "APPLICABLE" ? "🟢" : "⚪";

    return [
      `### ${statusEmoji} ${escapeMarkdown(code)}`,
      title ? `**${escapeMarkdown(title)}**` : null,
      description ? escapeMarkdown(description).slice(0, 500) : null,
      `Status: **${escapeMarkdown(status)}**`,
    ].filter(Boolean).join("\n");
  });

  return new EmbedBuilder()
    .setColor(0xff5200)
    .setAuthor({ name: "Swiggy Instamart" })
    .setTitle("🎟️ Available Instamart Coupons")
    .setDescription(lines.join("\n\n").slice(0, 4000))
    .setFooter({ text: `${Math.min(coupons.length, 15)} of ${coupons.length} coupon(s) shown • Address ${addressId}` })
    .setTimestamp();
}

function buildCouponAppliedEmbed(result: unknown, couponCode: string): EmbedBuilder {
  const data = dataOf(result);
  const message = text(data, ["message"]);
  const billBreakdown = isRecord(data?.billBreakdown) ? data.billBreakdown : null;
  const discount = billBreakdown ? text(billBreakdown, ["discount", "couponDiscount", "discountAmount"]) : null;
  const total = text(data, ["cartTotalAmount", "totalAmount", "total", "grandTotal", "payable"]);

  const details = [
    message ? escapeMarkdown(message) : "The coupon was applied successfully.",
    discount ? `**Discount:** ${escapeMarkdown(discount)}` : null,
    total ? `**Cart total:** ${escapeMarkdown(total)}` : null,
  ].filter(Boolean).join("\n\n");

  return new EmbedBuilder()
    .setColor(0x1da41a)
    .setAuthor({ name: "Swiggy Instamart" })
    .setTitle(`✅ Coupon Applied: ${escapeMarkdown(couponCode)}`)
    .setDescription(details.slice(0, 4000))
    .setFooter({ text: "The coupon is applied to your current cart" })
    .setTimestamp();
}

async function handleInstamartError(
  interaction: ChatInputCommandInteraction,
  error: unknown
): Promise<unknown> {
  if (error instanceof StoreClosedError) {
    const embed = new EmbedBuilder()
      .setColor("Red")
      .setAuthor({ name: "Swiggy Instamart" })
      .setTitle("🔴 Store Closed")
      .setDescription("The store is currently closed. Item inventory is not available at your selected location.")
      .setThumbnail("attachment://closed.png")
      .setTimestamp();

    const payload = { embeds: [embed], files: ["./src/public/closed.png"] };
    return interaction.deferred || interaction.replied ? interaction.editReply(payload) : interaction.reply(payload);
  }

  const message = `Instamart action failed: ${classifySwiggyError(error).userFriendlyMessage}`;
  return interaction.deferred || interaction.replied ? interaction.editReply(message) : interaction.reply(message);
}
