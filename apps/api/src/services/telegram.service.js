const axios = require("axios");
const crypto = require("crypto");

const Player = require("../models/Player");
const TelegramLinkToken = require("../models/TelegramLinkToken");
const TelegramSubscription = require("../models/TelegramSubscription");
const verifyDue = require("../middlewares/verify.due");
const {
  generateQrCodeDataUrl,
  generateQrCodePngBuffer,
} = require("../utils/qr-code");
const {
  getLastOutboundAtMs,
  getTelegramMax429Retries,
  getTelegramNotifyChatCooldownMs,
  getTelegramNotifyPlayerCooldownMs,
  getTelegramRetryAfterMs,
  resolveCooldownRemainingMs,
  sleep,
  splitTelegramText,
} = require("./telegram.notify.utils");

const DEFAULT_LINK_TTL_SECONDS = 15 * 60;

function createHttpError(status, message, code) {
  const error = new Error(message);
  error.status = status;

  if (code) {
    error.code = code;
  }

  return error;
}

function getRequiredEnv(name, fallback = null) {
  const value = String(process.env[name] || fallback || "").trim();

  if (!value) {
    throw createHttpError(500, `Missing env - ${name}`, "CONFIG_MISSING");
  }

  return value;
}

function getTelegramBotUsername() {
  return getRequiredEnv("TELEGRAM_BOT_USERNAME").replace(/^@+/, "");
}

function getTelegramBotToken() {
  return getRequiredEnv("TELEGRAM_BOT_TOKEN");
}

function getTelegramWebhookPathSecret() {
  return getRequiredEnv("TELEGRAM_WEBHOOK_SECRET");
}

function getTelegramWebhookHeaderSecret() {
  const value = String(process.env.TELEGRAM_WEBHOOK_HEADER_SECRET || "").trim();
  return value || null;
}

function getTelegramInternalSecret() {
  return getRequiredEnv("TELEGRAM_INTERNAL_SECRET", process.env.ADMIN_SECRET);
}

function getTelegramLinkTtlSeconds() {
  const value = Number(process.env.TELEGRAM_START_TOKEN_TTL_SECONDS || DEFAULT_LINK_TTL_SECONDS);

  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_LINK_TTL_SECONDS;
  }

  return Math.floor(value);
}

function toPlayerId(value) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function toChatId(value) {
  const parsed = String(value || "").trim();
  return parsed || null;
}

function hashLinkToken(token) {
  return crypto
    .createHash("sha256")
    .update(String(token))
    .digest("hex");
}

function generateOpaqueLinkToken() {
  return crypto.randomBytes(24).toString("base64url");
}

function isStartTokenFormatValid(token) {
  return /^[A-Za-z0-9_-]{16,128}$/.test(String(token || "").trim());
}

function buildTelegramStartUrl(startToken) {
  return `https://t.me/${getTelegramBotUsername()}?start=${encodeURIComponent(String(startToken || "").trim())}`;
}

function buildTelegramStartAppUrl(startToken) {
  return `tg://resolve?domain=${getTelegramBotUsername()}&start=${encodeURIComponent(String(startToken || "").trim())}`;
}

function buildTelegramStartCommand(startToken) {
  return `/start ${String(startToken || "").trim()}`;
}

function getTelegramApiUrl(method) {
  return `https://api.telegram.org/bot${getTelegramBotToken()}/${method}`;
}

function getTelegramProfile(from = {}) {
  return {
    telegramUserId: from?.id != null ? String(from.id) : null,
    username: from?.username || null,
    firstName: from?.first_name || null,
    lastName: from?.last_name || null,
  };
}

function parseTelegramCommand(text = "") {
  const rawText = String(text || "").trim();
  const match = rawText.match(/^\/([a-z_]+)(?:@[\w_]+)?(?:\s+(.+))?$/i);

  if (!match) {
    return null;
  }

  return {
    command: String(match[1] || "").toLowerCase(),
    args: String(match[2] || "").trim(),
  };
}

function formatChatSubscriptionsMessage(subscriptions = []) {
  if (!subscriptions.length) {
    return [
      "Nenhum player esta vinculado a este chat.",
      "",
      "Para ativar, gere um novo /start <token> no painel e envie aqui.",
    ].join("\n");
  }

  const lines = subscriptions
    .map((item) => `- Player ${item.playerId} (${item.status})`)
    .join("\n");

  return [
    "Players vinculados a este chat:",
    lines,
    "",
    "Use /stop <playerId> para remover um player especifico.",
    "Use /stop_all para remover todos deste chat.",
  ].join("\n");
}

function formatLinkSuccessMessage(playerId) {
  return [
    `Player ${playerId} vinculado com sucesso a este Telegram.`,
    "",
    "Comandos disponiveis neste chat:",
    "/status",
    "/stop <playerId>",
    "/stop_all",
  ].join("\n");
}

function formatHelpMessage() {
  return [
    "Para vincular este chat, copie e envie:",
    "/start <token>",
    "",
    "Depois que cadastrar, use:",
    "/status",
    "/stop <playerId>",
    "/stop_all",
  ].join("\n");
}

function formatReactivateMessage() {
  return [
    "Para ativar novamente, gere um novo /start <token> no painel e envie aqui.",
  ].join("\n");
}

async function createTelegramLinkPayload({ playerId, includeQrDataUrl = false } = {}) {
  const normalizedPlayerId = toPlayerId(playerId);

  if (!normalizedPlayerId) {
    throw createHttpError(400, "Bad request - Invalid or missing playerId");
  }

  const now = new Date();
  const linkToken = generateOpaqueLinkToken();
  const tokenHash = hashLinkToken(linkToken);
  const ttlSeconds = getTelegramLinkTtlSeconds();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
  const url = buildTelegramStartUrl(linkToken);
  const appUrl = buildTelegramStartAppUrl(linkToken);
  const command = buildTelegramStartCommand(linkToken);

  await TelegramLinkToken.deleteMany({
    playerId: normalizedPlayerId,
    purpose: "telegram-link",
    usedAt: null,
    expiresAt: { $gt: now },
  });

  await TelegramLinkToken.create({
    tokenHash,
    playerId: normalizedPlayerId,
    purpose: "telegram-link",
    expiresAt,
  });

  const payload = {
    playerId: normalizedPlayerId,
    token: linkToken,
    url,
    appUrl,
    command,
    ttlSeconds,
    expiresAt,
  };

  if (includeQrDataUrl) {
    payload.qrCodeDataUrl = await generateQrCodeDataUrl(url);
  }

  return payload;
}

async function createTelegramQrPayload({ playerId, token = null } = {}) {
  let payload = null;

  if (token) {
    if (!isStartTokenFormatValid(token)) {
      throw createHttpError(400, "Bad request - Invalid token format");
    }

    payload = {
      playerId: toPlayerId(playerId),
      token,
      url: buildTelegramStartUrl(token),
      appUrl: buildTelegramStartAppUrl(token),
      command: buildTelegramStartCommand(token),
      ttlSeconds: null,
      expiresAt: null,
    };
  } else {
    payload = await createTelegramLinkPayload({ playerId, includeQrDataUrl: false });
  }

  payload.imageBuffer = await generateQrCodePngBuffer(payload.url);
  return payload;
}

async function listPlayerSubscriptions({ playerId, includeInactive = true } = {}) {
  const normalizedPlayerId = toPlayerId(playerId);

  if (!normalizedPlayerId) {
    throw createHttpError(400, "Bad request - Invalid or missing playerId");
  }

  const filters = { playerId: normalizedPlayerId };

  if (!includeInactive) {
    filters.status = "active";
  }

  return TelegramSubscription
    .find(filters)
    .sort({ status: 1, chatId: 1, linkedAt: -1 })
    .lean();
}

async function updatePhoneForChat({ chatId, from, phoneNumber }) {
  if (!phoneNumber) {
    return 0;
  }

  const normalizedChatId = toChatId(chatId);

  if (!normalizedChatId) {
    return 0;
  }

  const now = new Date();
  const profile = getTelegramProfile(from);
  const result = await TelegramSubscription.updateMany(
    { chatId: normalizedChatId, status: "active" },
    {
      $set: {
        ...profile,
        phoneNumber: String(phoneNumber),
        lastInboundAt: now,
      },
    },
  );

  return result.modifiedCount || 0;
}

async function activateTelegramSubscription({ playerId, chatId, from, phoneNumber = null }) {
  const normalizedPlayerId = toPlayerId(playerId);
  const normalizedChatId = toChatId(chatId);

  if (!normalizedPlayerId || !normalizedChatId) {
    throw createHttpError(400, "Bad request - Invalid Telegram subscription data");
  }

  const now = new Date();
  const profile = getTelegramProfile(from);

  return TelegramSubscription.findOneAndUpdate(
    {
      playerId: normalizedPlayerId,
      chatId: normalizedChatId,
    },
    {
      $set: {
        ...profile,
        status: "active",
        linkedAt: now,
        revokedAt: null,
        blockedAt: null,
        lastInboundAt: now,
        lastErrorAt: null,
        lastErrorMessage: null,
        ...(phoneNumber ? { phoneNumber: String(phoneNumber) } : {}),
      },
      $setOnInsert: {
        playerId: normalizedPlayerId,
        chatId: normalizedChatId,
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    },
  ).lean();
}

async function consumeTelegramLinkToken({ token, chatId }) {
  if (!isStartTokenFormatValid(token)) {
    throw createHttpError(400, "Link invalido ou mal formatado", "LINK_INVALID");
  }

  const now = new Date();
  const normalizedChatId = toChatId(chatId);

  if (!normalizedChatId) {
    throw createHttpError(400, "Chat invalido", "CHAT_INVALID");
  }

  const tokenHash = hashLinkToken(token);
  const linkToken = await TelegramLinkToken.findOneAndUpdate(
    {
      tokenHash,
      purpose: "telegram-link",
      usedAt: null,
      expiresAt: { $gt: now },
    },
    {
      $set: {
        usedAt: now,
        usedByChatId: normalizedChatId,
      },
    },
    {
      new: true,
    },
  ).lean();

  if (!linkToken) {
    throw createHttpError(400, "Link expirado, invalido ou ja utilizado", "LINK_CONSUMED");
  }

  return linkToken;
}

async function revokeTelegramSubscription({ chatId, playerId }) {
  const normalizedChatId = toChatId(chatId);
  const normalizedPlayerId = toPlayerId(playerId);

  if (!normalizedChatId || !normalizedPlayerId) {
    throw createHttpError(400, "Bad request - Invalid chatId or playerId");
  }

  const now = new Date();

  return TelegramSubscription.findOneAndUpdate(
    {
      chatId: normalizedChatId,
      playerId: normalizedPlayerId,
      status: "active",
    },
    {
      $set: {
        status: "revoked",
        revokedAt: now,
        lastInboundAt: now,
      },
    },
    {
      new: true,
    },
  ).lean();
}

async function revokeTelegramSubscriptionsByChat(chatId) {
  const normalizedChatId = toChatId(chatId);

  if (!normalizedChatId) {
    throw createHttpError(400, "Bad request - Invalid chatId");
  }

  const now = new Date();
  const result = await TelegramSubscription.updateMany(
    {
      chatId: normalizedChatId,
      status: "active",
    },
    {
      $set: {
        status: "revoked",
        revokedAt: now,
        lastInboundAt: now,
      },
    },
  );

  return result.modifiedCount || 0;
}

async function listChatSubscriptions(chatId, { includeInactive = false } = {}) {
  const normalizedChatId = toChatId(chatId);

  if (!normalizedChatId) {
    return [];
  }

  const filters = { chatId: normalizedChatId };

  if (!includeInactive) {
    filters.status = "active";
  }

  return TelegramSubscription
    .find(filters)
    .sort({ playerId: 1, linkedAt: -1 })
    .lean();
}

async function sendTelegramTextMessagePart(chatId, text) {
  const normalizedChatId = toChatId(chatId);

  if (!normalizedChatId) {
    throw createHttpError(400, "Bad request - Invalid chatId");
  }

  const body = {
    chat_id: normalizedChatId,
    text: String(text || ""),
    disable_web_page_preview: true,
  };

  let attempt = 0;
  const max429Retries = getTelegramMax429Retries();

  while (true) {
    try {
      return await axios.post(getTelegramApiUrl("sendMessage"), body, {
        timeout: 10000,
      });
    } catch (error) {
      const statusCode = Number(error?.response?.status || 0);

      if (statusCode !== 429 || attempt >= max429Retries) {
        throw error;
      }

      attempt += 1;
      await sleep(getTelegramRetryAfterMs(error));
    }
  }
}

async function sendTelegramTextMessage(chatId, text, { parts = null } = {}) {
  const normalizedChatId = toChatId(chatId);

  if (!normalizedChatId) {
    throw createHttpError(400, "Bad request - Invalid chatId");
  }

  const messageParts = Array.isArray(parts) && parts.length
    ? parts
    : splitTelegramText(text);

  if (!messageParts.length) {
    throw createHttpError(400, "Bad request - Invalid or missing message");
  }

  const responses = [];

  for (const part of messageParts) {
    responses.push(await sendTelegramTextMessagePart(normalizedChatId, part));
  }

  return {
    ok: true,
    chatId: normalizedChatId,
    partsCount: messageParts.length,
    responses,
  };
}

async function hasActiveLicense(playerId) {
  const normalizedPlayerId = toPlayerId(playerId);

  if (!normalizedPlayerId) {
    return false;
  }

  const players = await Player
    .find({ player_id: normalizedPlayerId })
    .select({ due: 1 })
    .lean();

  return players.some((player) => verifyDue(player?.due));
}

async function markSendSuccess(subscription, sentAt = new Date()) {
  await TelegramSubscription.findOneAndUpdate(
    {
      playerId: subscription.playerId,
      chatId: subscription.chatId,
    },
    {
      $set: {
        lastOutboundAt: sentAt,
        lastErrorAt: null,
        lastErrorMessage: null,
      },
    },
  );
}

async function markSendFailure(subscription, error) {
  const now = new Date();
  const statusCode = Number(error?.response?.status || 0);
  const message = String(
    error?.response?.data?.description
    || error?.message
    || "Telegram send failed",
  );

  const updates = {
    lastErrorAt: now,
    lastErrorMessage: message,
  };

  if (statusCode === 403) {
    updates.status = "blocked";
    updates.blockedAt = now;
  }

  await TelegramSubscription.findOneAndUpdate(
    {
      playerId: subscription.playerId,
      chatId: subscription.chatId,
    },
    {
      $set: updates,
    },
  );

  return {
    statusCode,
    message,
    retryAfterMs: statusCode === 429 ? getTelegramRetryAfterMs(error) : 0,
  };
}

async function notifyTelegramByPlayer({ playerId, message }) {
  const normalizedPlayerId = toPlayerId(playerId);
  const text = String(message || "").trim();

  if (!normalizedPlayerId) {
    throw createHttpError(400, "Bad request - Invalid or missing playerId");
  }

  if (!text) {
    throw createHttpError(400, "Bad request - Invalid or missing message");
  }

  if (!(await hasActiveLicense(normalizedPlayerId))) {
    throw createHttpError(403, "Forbidden - Player licence expired or not found");
  }

  const subscriptions = await TelegramSubscription
    .find({ playerId: normalizedPlayerId, status: "active" })
    .sort({ linkedAt: 1 })
    .lean();

  if (!subscriptions.length) {
    return {
      ok: true,
      playerId: normalizedPlayerId,
      subscriptionsCount: 0,
      sentCount: 0,
      failedCount: 0,
      blockedCount: 0,
      results: [],
    };
  }

  const playerCooldownMs = getTelegramNotifyPlayerCooldownMs();
  const chatCooldownMs = getTelegramNotifyChatCooldownMs();
  const nowMs = Date.now();
  const messageParts = splitTelegramText(text);
  const results = [];
  const playerCooldownRemainingMs = resolveCooldownRemainingMs(
    getLastOutboundAtMs(subscriptions),
    playerCooldownMs,
    nowMs,
  );

  if (playerCooldownRemainingMs > 0) {
    for (const subscription of subscriptions) {
      results.push({
        chatId: subscription.chatId,
        ok: true,
        sent: false,
        skipped: true,
        reason: "player_cooldown",
        retryAfterMs: playerCooldownRemainingMs,
      });
    }

    return {
      ok: true,
      playerId: normalizedPlayerId,
      subscriptionsCount: subscriptions.length,
      sentCount: 0,
      failedCount: 0,
      skippedCount: results.length,
      blockedCount: 0,
      partsCount: messageParts.length,
      results,
    };
  }

  for (const subscription of subscriptions) {
    const chatCooldownRemainingMs = resolveCooldownRemainingMs(
      subscription.lastOutboundAt,
      chatCooldownMs,
      nowMs,
    );

    if (chatCooldownRemainingMs > 0) {
      results.push({
        chatId: subscription.chatId,
        ok: true,
        sent: false,
        skipped: true,
        reason: "chat_cooldown",
        retryAfterMs: chatCooldownRemainingMs,
      });
      continue;
    }

    try {
      const sendResult = await sendTelegramTextMessage(subscription.chatId, text, {
        parts: messageParts,
      });
      const sentAt = new Date();

      await markSendSuccess(subscription, sentAt);
      results.push({
        chatId: subscription.chatId,
        ok: true,
        sent: true,
        partsCount: sendResult.partsCount,
        sentAt: sentAt.toISOString(),
      });
    } catch (error) {
      const failure = await markSendFailure(subscription, error);
      results.push({
        chatId: subscription.chatId,
        ok: false,
        sent: false,
        statusCode: failure.statusCode,
        error: failure.message,
        retryAfterMs: failure.retryAfterMs,
      });
    }
  }

  return {
    ok: true,
    playerId: normalizedPlayerId,
    subscriptionsCount: subscriptions.length,
    sentCount: results.filter((item) => item.sent).length,
    failedCount: results.filter((item) => !item.ok).length,
    skippedCount: results.filter((item) => item.skipped).length,
    blockedCount: results.filter((item) => item.statusCode === 403).length,
    partsCount: messageParts.length,
    results,
  };
}

function assertTelegramWebhookRequest(req) {
  const secret = String(req.params.secret || "").trim();
  const expectedPathSecret = getTelegramWebhookPathSecret();

  if (secret !== expectedPathSecret) {
    throw createHttpError(404, "Not found");
  }

  const expectedHeaderSecret = getTelegramWebhookHeaderSecret();

  if (!expectedHeaderSecret) {
    return;
  }

  const headerSecret = String(
    req.headers["x-telegram-bot-api-secret-token"] || "",
  ).trim();

  if (headerSecret !== expectedHeaderSecret) {
    throw createHttpError(403, "Forbidden - Invalid Telegram secret token");
  }
}

async function handleStartCommand({ chatId, from, args }) {
  if (!args) {
    await sendTelegramTextMessage(chatId, formatHelpMessage());
    return { handled: true, action: "start_help" };
  }

  const linkToken = await consumeTelegramLinkToken({ token: args, chatId });

  await activateTelegramSubscription({
    playerId: linkToken.playerId,
    chatId,
    from,
  });

  await sendTelegramTextMessage(chatId, formatLinkSuccessMessage(linkToken.playerId));

  return {
    handled: true,
    action: "start_linked",
    playerId: linkToken.playerId,
  };
}

async function handleStatusCommand({ chatId }) {
  const subscriptions = await listChatSubscriptions(chatId, { includeInactive: false });
  await sendTelegramTextMessage(chatId, formatChatSubscriptionsMessage(subscriptions));

  return {
    handled: true,
    action: "status",
    count: subscriptions.length,
  };
}

async function handleStopCommand({ chatId, args }) {
  if (!args) {
    const subscriptions = await listChatSubscriptions(chatId, { includeInactive: false });

    if (!subscriptions.length) {
      await sendTelegramTextMessage(
        chatId,
        [
          "Nenhum player ativo esta vinculado a este chat.",
          "",
          formatReactivateMessage(),
        ].join("\n"),
      );
      return { handled: true, action: "stop_none" };
    }

    if (subscriptions.length === 1) {
      await revokeTelegramSubscription({
        chatId,
        playerId: subscriptions[0].playerId,
      });

      await sendTelegramTextMessage(
        chatId,
        [
          `Player ${subscriptions[0].playerId} removido deste chat.`,
          "",
          formatReactivateMessage(),
        ].join("\n"),
      );

      return {
        handled: true,
        action: "stop_single",
        playerId: subscriptions[0].playerId,
      };
    }

    await sendTelegramTextMessage(
      chatId,
      "Este chat possui varios players. Use /stop <playerId> ou /stop_all.",
    );

    return { handled: true, action: "stop_choose" };
  }

  const playerId = toPlayerId(args);

  if (!playerId) {
    await sendTelegramTextMessage(chatId, "PlayerId invalido. Use /stop <playerId>.");
    return { handled: true, action: "stop_invalid" };
  }

  const revoked = await revokeTelegramSubscription({ chatId, playerId });

  if (!revoked) {
    await sendTelegramTextMessage(
      chatId,
      [
        `Nenhum vinculo ativo encontrado para o player ${playerId} neste chat.`,
        "",
        formatReactivateMessage(),
      ].join("\n"),
    );

    return { handled: true, action: "stop_not_found", playerId };
  }

  await sendTelegramTextMessage(
    chatId,
    [
      `Player ${playerId} removido deste chat.`,
      "",
      formatReactivateMessage(),
    ].join("\n"),
  );

  return { handled: true, action: "stop", playerId };
}

async function handleStopAllCommand({ chatId }) {
  const count = await revokeTelegramSubscriptionsByChat(chatId);

  await sendTelegramTextMessage(
    chatId,
    count
      ? [
          `Todos os vinculos deste chat foram removidos (${count}).`,
          "",
          formatReactivateMessage(),
        ].join("\n")
      : [
          "Nenhum vinculo ativo encontrado para este chat.",
          "",
          formatReactivateMessage(),
        ].join("\n"),
  );

  return {
    handled: true,
    action: "stop_all",
    count,
  };
}

async function handleTelegramWebhookUpdate(update = {}) {
  const message = update?.message || update?.edited_message || null;

  if (!message?.chat?.id) {
    return {
      handled: false,
      action: "ignored",
      reason: "unsupported_update",
    };
  }

  const chatId = String(message.chat.id);
  const from = message.from || {};

  if (message?.contact?.phone_number) {
    const contactUserId = message?.contact?.user_id != null
      ? String(message.contact.user_id)
      : null;
    const fromUserId = from?.id != null ? String(from.id) : null;

    if (contactUserId && fromUserId && contactUserId !== fromUserId) {
      await sendTelegramTextMessage(
        chatId,
        "Compartilhe o seu proprio contato para salvar o telefone neste cadastro.",
      );

      return {
        handled: true,
        action: "contact_rejected",
      };
    }

    const updatedCount = await updatePhoneForChat({
      chatId,
      from,
      phoneNumber: message.contact.phone_number,
    });

    await sendTelegramTextMessage(
      chatId,
      updatedCount
        ? "Telefone atualizado para os players vinculados neste chat."
        : "Nenhum player ativo encontrado para atualizar o telefone.",
    );

    return {
      handled: true,
      action: "contact",
      updatedCount,
    };
  }

  const command = parseTelegramCommand(message?.text);

  if (!command) {
    await sendTelegramTextMessage(chatId, formatHelpMessage());
    return {
      handled: true,
      action: "help",
    };
  }

  if (command.command === "start") {
    return handleStartCommand({ chatId, from, args: command.args });
  }

  if (command.command === "status") {
    return handleStatusCommand({ chatId });
  }

  if (command.command === "stop") {
    return handleStopCommand({ chatId, args: command.args });
  }

  if (command.command === "stop_all") {
    return handleStopAllCommand({ chatId });
  }

  await sendTelegramTextMessage(chatId, formatHelpMessage());

  return {
    handled: true,
    action: "help",
  };
}

module.exports = {
  assertTelegramWebhookRequest,
  createHttpError,
  createTelegramLinkPayload,
  createTelegramQrPayload,
  getTelegramInternalSecret,
  handleTelegramWebhookUpdate,
  listPlayerSubscriptions,
  notifyTelegramByPlayer,
  toPlayerId,
};
