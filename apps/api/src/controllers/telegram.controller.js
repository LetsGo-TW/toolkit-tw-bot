const express = require("express");

const authMiddleware = require("../middlewares/auth.middleware");
const Player = require("../models/Player");
const {
  assertTelegramWebhookRequest,
  createHttpError,
  createTelegramLinkPayload,
  createTelegramQrPayload,
  getTelegramInternalSecret,
  handleTelegramWebhookUpdate,
  listPlayerSubscriptions,
  notifyTelegramByPlayer,
  toPlayerId,
} = require("../services/telegram.service");

const authRouter = express.Router();
const publicRouter = express.Router();
const internalRouter = express.Router();

authRouter.use(authMiddleware);

function sendError(res, error) {
  const status = Number(error?.status || 500);
  const payload = {
    error: error?.message || "Internal server error",
  };

  if (error?.code) {
    payload.code = error.code;
  }

  return res.status(status).send(payload);
}

function parseAuthorizationHeader(authHeader = "") {
  const header = String(authHeader || "").trim();

  if (!header) {
    return null;
  }

  const parts = header.split(" ");

  if (parts.length !== 2 || !/^Bearer$/i.test(parts[0])) {
    return null;
  }

  return parts[1];
}

async function getAuthenticatedPlayer(req) {
  const authId = String(req?.auth?.id || "").trim();

  if (!authId) {
    throw createHttpError(401, "Unauthorized - Invalid token payload");
  }

  const player = await Player.findById(authId).lean();

  if (!player) {
    throw createHttpError(404, "Not found - Player licence not found");
  }

  return player;
}

function resolveAuthorizedPlayerId(req, player) {
  const authenticatedPlayerId = toPlayerId(player?.player_id);
  const requestedPlayerId = req.query.playerId == null
    ? null
    : toPlayerId(req.query.playerId);

  if (!authenticatedPlayerId) {
    throw createHttpError(400, "Bad request - Invalid authenticated playerId");
  }

  if (requestedPlayerId != null && requestedPlayerId !== authenticatedPlayerId) {
    throw createHttpError(403, "Forbidden - playerId does not match authenticated licence");
  }

  return authenticatedPlayerId;
}

function internalAuthMiddleware(req, res, next) {
  try {
    const providedSecret = parseAuthorizationHeader(req.headers.authorization);
    const expectedSecret = getTelegramInternalSecret();

    if (!providedSecret) {
      return res.status(400).send({
        error: "Bad request - Authorization provided not found",
      });
    }

    if (providedSecret !== expectedSecret) {
      return res.status(403).send({
        error: "Forbidden - Invalid internal authorization",
      });
    }

    return next();
  } catch (error) {
    return sendError(res, error);
  }
}

authRouter.get("/link", async (req, res) => {
  try {
    const player = await getAuthenticatedPlayer(req);
    const playerId = resolveAuthorizedPlayerId(req, player);
    const payload = await createTelegramLinkPayload({
      playerId,
      includeQrDataUrl: true,
    });

    return res.send({
      ok: true,
      playerId,
      token: payload.token,
      url: payload.url,
      ttlSeconds: payload.ttlSeconds,
      expiresAt: payload.expiresAt?.toISOString() || null,
      qrCodeDataUrl: payload.qrCodeDataUrl || null,
    });
  } catch (error) {
    return sendError(res, error);
  }
});

authRouter.get("/qr", async (req, res) => {
  try {
    const player = await getAuthenticatedPlayer(req);
    const playerId = resolveAuthorizedPlayerId(req, player);
    const payload = await createTelegramQrPayload({
      playerId,
      token: req.query.token ? String(req.query.token) : null,
    });

    res.set("Cache-Control", "no-store");
    res.set("Content-Type", "image/png");
    res.set("X-Telegram-Link-Url", payload.url);

    if (payload.expiresAt) {
      res.set("X-Telegram-Link-Expires-At", payload.expiresAt.toISOString());
    }

    return res.send(payload.imageBuffer);
  } catch (error) {
    return sendError(res, error);
  }
});

authRouter.get("/status", async (req, res) => {
  try {
    const player = await getAuthenticatedPlayer(req);
    const playerId = resolveAuthorizedPlayerId(req, player);
    const subscriptions = await listPlayerSubscriptions({
      playerId,
      includeInactive: true,
    });

    return res.send({
      ok: true,
      playerId,
      subscriptions,
    });
  } catch (error) {
    return sendError(res, error);
  }
});

publicRouter.post("/webhook/:secret", async (req, res) => {
  try {
    assertTelegramWebhookRequest(req);
  } catch (error) {
    return sendError(res, error);
  }

  try {
    const result = await handleTelegramWebhookUpdate(req.body || {});
    return res.send({
      ok: true,
      result,
    });
  } catch (error) {
    console.error("[telegram webhook]", error);
    return res.send({
      ok: true,
      error: error?.message || "Webhook processing failed",
    });
  }
});

internalRouter.use(internalAuthMiddleware);

internalRouter.post("/notify", async (req, res) => {
  try {
    const payload = req.body || {};
    const result = await notifyTelegramByPlayer({
      playerId: payload.playerId,
      message: payload.message ?? payload.mensagem,
    });

    return res.send(result);
  } catch (error) {
    return sendError(res, error);
  }
});

module.exports = (app) => {
  app.use("/auth/telegram", authRouter);
  app.use("/telegram", publicRouter);
  app.use("/internal/telegram", internalRouter);
};
