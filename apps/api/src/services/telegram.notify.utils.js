const DEFAULT_TELEGRAM_MAX_TEXT_CHARS = 4096;
const DEFAULT_TELEGRAM_NOTIFY_PLAYER_COOLDOWN_MS = 3000;
const DEFAULT_TELEGRAM_NOTIFY_CHAT_COOLDOWN_MS = 1000;
const DEFAULT_TELEGRAM_429_RETRY_MS = 1000;
const DEFAULT_TELEGRAM_MAX_429_RETRIES = 2;
const TELEGRAM_SPLIT_SOFT_LIMIT_RATIO = 0.75;

function normalizePositiveInteger(value, fallback = 0) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function getTelegramMaxTextChars() {
  return normalizePositiveInteger(
    process.env.TELEGRAM_MAX_TEXT_CHARS,
    DEFAULT_TELEGRAM_MAX_TEXT_CHARS,
  ) || DEFAULT_TELEGRAM_MAX_TEXT_CHARS;
}

function getTelegramNotifyPlayerCooldownMs() {
  return normalizePositiveInteger(
    process.env.TELEGRAM_NOTIFY_PLAYER_COOLDOWN_MS,
    DEFAULT_TELEGRAM_NOTIFY_PLAYER_COOLDOWN_MS,
  );
}

function getTelegramNotifyChatCooldownMs() {
  return normalizePositiveInteger(
    process.env.TELEGRAM_NOTIFY_CHAT_COOLDOWN_MS,
    DEFAULT_TELEGRAM_NOTIFY_CHAT_COOLDOWN_MS,
  );
}

function getTelegramMax429Retries() {
  return normalizePositiveInteger(
    process.env.TELEGRAM_MAX_429_RETRIES,
    DEFAULT_TELEGRAM_MAX_429_RETRIES,
  );
}

function sleep(ms) {
  const waitMs = normalizePositiveInteger(ms, 0);
  return new Promise((resolve) => setTimeout(resolve, waitMs));
}

function splitTelegramText(text = "", maxChars = getTelegramMaxTextChars()) {
  const normalized = String(text || "").trim();

  if (!normalized) {
    return [];
  }

  const safeMaxChars = normalizePositiveInteger(maxChars, DEFAULT_TELEGRAM_MAX_TEXT_CHARS)
    || DEFAULT_TELEGRAM_MAX_TEXT_CHARS;
  const chars = Array.from(normalized);

  if (chars.length <= safeMaxChars) {
    return [normalized];
  }

  const parts = [];
  let start = 0;
  const minBoundary = Math.max(1, Math.floor(safeMaxChars * TELEGRAM_SPLIT_SOFT_LIMIT_RATIO));

  while (start < chars.length) {
    const remaining = chars.length - start;

    if (remaining <= safeMaxChars) {
      const tail = chars.slice(start).join("").trim();
      if (tail) {
        parts.push(tail);
      }
      break;
    }

    let cut = start + safeMaxChars;

    for (let i = start + safeMaxChars; i > start + minBoundary; i -= 1) {
      if (chars[i - 1] === "\n") {
        cut = i;
        break;
      }
    }

    if (cut === start + safeMaxChars) {
      for (let i = start + safeMaxChars; i > start + minBoundary; i -= 1) {
        if (chars[i - 1] === " ") {
          cut = i;
          break;
        }
      }
    }

    let part = chars.slice(start, cut).join("").trim();

    if (!part) {
      cut = start + safeMaxChars;
      part = chars.slice(start, cut).join("");
    }

    parts.push(part);
    start = cut;

    while (start < chars.length && /\s/.test(chars[start])) {
      start += 1;
    }
  }

  return parts;
}

function getTelegramRetryAfterMs(error) {
  const retryAfterSeconds = Number(
    error?.response?.data?.parameters?.retry_after
    ?? error?.response?.headers?.["retry-after"]
    ?? 0,
  );

  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.ceil(retryAfterSeconds * 1000);
  }

  return DEFAULT_TELEGRAM_429_RETRY_MS;
}

function getLastOutboundAtMs(items = []) {
  return (Array.isArray(items) ? items : []).reduce((latest, item) => {
    const current = new Date(item?.lastOutboundAt || 0).getTime();
    if (!Number.isFinite(current) || current <= 0) {
      return latest;
    }
    return Math.max(latest, current);
  }, 0);
}

function resolveCooldownRemainingMs(lastOutboundAt, cooldownMs, nowMs = Date.now()) {
  const safeCooldownMs = normalizePositiveInteger(cooldownMs, 0);
  const outboundAtMs = new Date(lastOutboundAt || 0).getTime();
  const currentMs = Number(nowMs);

  if (!safeCooldownMs || !Number.isFinite(outboundAtMs) || outboundAtMs <= 0 || !Number.isFinite(currentMs)) {
    return 0;
  }

  return Math.max(0, (outboundAtMs + safeCooldownMs) - currentMs);
}

module.exports = {
  DEFAULT_TELEGRAM_MAX_TEXT_CHARS,
  getLastOutboundAtMs,
  getTelegramMax429Retries,
  getTelegramMaxTextChars,
  getTelegramNotifyChatCooldownMs,
  getTelegramNotifyPlayerCooldownMs,
  getTelegramRetryAfterMs,
  resolveCooldownRemainingMs,
  sleep,
  splitTelegramText,
};
