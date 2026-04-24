import { assertNoCaptchaInGame } from "../../shared/assertNoCaptchaInGame";
import { assertNoGameUpdateOrBlockedRequest } from "../../shared/assertNoGameUpdateOrBlockedRequest";

const looksLikeHtmlResponse = (text = "") => {
  const normalized = String(text || "").toLowerCase().trim();

  if (!normalized) return false;

  return normalized.includes("<html")
    || normalized.includes("<!doctype")
    || normalized.includes('id="ds_body"')
    || normalized.includes("id='ds_body'")
    || normalized.includes("bot_check")
    || normalized.includes("botprotection_quest")
    || normalized.includes("popup_box_bot_protection")
    || normalized.includes('id="error"')
    || normalized.includes("id='error'");
};

const parseHtml = (text = "") => new DOMParser().parseFromString(String(text || ""), "text/html");

function assertTwHtmlNotSpecial(text = "", context = "planner:post") {
  if (!looksLikeHtmlResponse(text)) return;

  const html = parseHtml(text);
  assertNoCaptchaInGame(html, context);
  assertNoGameUpdateOrBlockedRequest(html, { context });
}

function parseTwJsonText(text = "", context = "planner:post") {
  assertTwHtmlNotSpecial(text, context);
  return JSON.parse(String(text || ""));
}

export {
  assertTwHtmlNotSpecial,
  parseTwJsonText
};
