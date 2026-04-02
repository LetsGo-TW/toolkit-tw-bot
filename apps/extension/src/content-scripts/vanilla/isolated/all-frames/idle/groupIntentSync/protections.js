import { parseUrl, readCurrentGroupIntentContext, toFiniteNumber } from "./context"
import {
  getContextualGroupFixUrlBlockReason,
  isGroupManagementScreenUrl,
  isTwGameUrl
} from "./url"

export const GROUP_INTENT_SYNC_IGNORE_ATTR = "data-go-group-intent-sync-ignore"

const SAFE_ANCHOR_TARGETS = new Set(["", "_self", "_blank", "_top", "_parent"])
const UNSUPPORTED_URL_SCHEME_PATTERN = /^(javascript:|mailto:|tel:|blob:|data:)/i

export const isTopWindow = () => {
  try {
    return window.self === window.top
  } catch {
    return false
  }
}

export const getGroupIntentMountBlockReason = (
  context = readCurrentGroupIntentContext()
) => {
  const url = parseUrl(context?.href || window.location.href)

  if (!isTopWindow()) return "not-top-window"
  if (!context?.has_game_data) return "missing-game-data"
  if (toFiniteNumber(context?.player_villages, null) === 0) return "player-without-villages"
  if (!url || !isTwGameUrl(url)) return "non-game-page"
  if (String(context?.world || "").trim().toLowerCase() === "www") return "world-www"
  if (context?.premium_active === false) return "premium-inactive"
  if (!Number.isFinite(toFiniteNumber(context?.player_id, null))) return "missing-player-id"

  return ""
}

export const getAnchorRewriteBlockReason = (anchor) => {
  if (!(anchor instanceof HTMLAnchorElement)) return "missing-anchor"
  if (anchor.hasAttribute(GROUP_INTENT_SYNC_IGNORE_ATTR)) return "ignored"
  if (anchor.hasAttribute("download")) return "download"
  if (anchor.closest("#go-planner-senders")) return "planner-senders"
  if (anchor.matches("span.scav-itens a.scav")) return "scavenge-link"
  if (anchor.closest("div.vis_item")) return "vis-item"
  if (isGroupManagementScreenUrl(window.location.href) && anchor.closest("#group_list")) {
    return "groups-list"
  }

  const rawHref = String(anchor.getAttribute("href") || "").trim()
  if (!rawHref) return "missing-href"

  const normalizedHref = rawHref.toLowerCase()
  if (normalizedHref.startsWith("#")) return "hash-only"
  if (UNSUPPORTED_URL_SCHEME_PATTERN.test(normalizedHref)) {
    return "unsupported-scheme"
  }

  const target = String(anchor.getAttribute("target") || "").trim().toLowerCase()
  if (target && !SAFE_ANCHOR_TARGETS.has(target)) return "unsupported-target"

  const blockReason = getContextualGroupFixUrlBlockReason({
    currentUrlLike: window.location.href,
    targetUrlLike: rawHref
  })
  if (blockReason) return blockReason

  return ""
}

export const getFormRewriteBlockReason = (form) => {
  if (!(form instanceof HTMLFormElement)) return "missing-form"
  if (form.hasAttribute(GROUP_INTENT_SYNC_IGNORE_ATTR)) return "ignored"
  if (form.closest("#go-planner-senders")) return "planner-senders"
  if (form.closest("div.vis_item")) return "vis-item"
  if (form.closest("#reassign_village_to_groups_form_group_assignment")) return "reassign-village-to-groups"
  if (form.closest('[id^="reassign_village_to_groups_form_group_edit_div_"]')) return "reassign-village-to-groups-edit"
  if (isGroupManagementScreenUrl(window.location.href) && form.closest("#group_list")) {
    return "groups-list"
  }

  const rawAction = String(form.getAttribute("action") || "").trim()
  if (!rawAction) return "missing-action"

  const normalizedAction = rawAction.toLowerCase()
  if (normalizedAction.startsWith("#")) return "hash-only"
  if (UNSUPPORTED_URL_SCHEME_PATTERN.test(normalizedAction)) {
    return "unsupported-scheme"
  }

  const blockReason = getContextualGroupFixUrlBlockReason({
    currentUrlLike: window.location.href,
    targetUrlLike: rawAction
  })
  if (blockReason) return blockReason

  return ""
}

export const getOptionRewriteBlockReason = (option) => {
  if (!(option instanceof HTMLOptionElement)) return "missing-option"
  if (option.hasAttribute(GROUP_INTENT_SYNC_IGNORE_ATTR)) return "ignored"

  const rawValue = String(option.getAttribute("value") || "").trim()
  if (!rawValue) return "missing-value"

  const normalizedValue = rawValue.toLowerCase()
  if (normalizedValue.startsWith("#")) return "hash-only"
  if (UNSUPPORTED_URL_SCHEME_PATTERN.test(normalizedValue)) {
    return "unsupported-scheme"
  }

  const blockReason = getContextualGroupFixUrlBlockReason({
    currentUrlLike: window.location.href,
    targetUrlLike: rawValue
  })
  if (blockReason) return blockReason

  return ""
}

export default {
  getAnchorRewriteBlockReason,
  getFormRewriteBlockReason,
  getOptionRewriteBlockReason,
  getGroupIntentMountBlockReason,
  GROUP_INTENT_SYNC_IGNORE_ATTR,
  isTopWindow
}
