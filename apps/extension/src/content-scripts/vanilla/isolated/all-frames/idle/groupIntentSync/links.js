import { withGroupFix, isTwGameUrl } from "./url"
import {
  getAnchorRewriteBlockReason,
  getFormRewriteBlockReason,
  getOptionRewriteBlockReason
} from "./protections"

const PATCH_ATTR = "data-go-group-intent-sync"

const FORCE_GROUP_REWRITE_OPTIONS = {
  forceExplicitGroup: true
}

export const resolveAnchorElement = (value) => (
  value instanceof HTMLAnchorElement
    ? value
    : value instanceof Element
      ? value.closest("a[href]")
      : null
)

export const resolveFormElement = (value) => (
  value instanceof HTMLFormElement
    ? value
    : value instanceof Element
      ? value.closest("form[action]")
      : null
)

export const resolveOptionElement = (value) => (
  value instanceof HTMLOptionElement
    ? value
    : value instanceof Element
      ? value.closest("option[value]")
      : null
)

const resolveAbsoluteUrl = (rawUrl) => {
  try {
    return new URL(String(rawUrl || "").trim(), window.location.href)
  } catch {
    return null
  }
}

const rewriteUrlAttributeDetailed = ({
  elementLike,
  attrName,
  groupId,
  blockReasonResolver,
  invalidReason,
  mode
} = {}) => {
  const element = (
    attrName === "action"
      ? resolveFormElement(elementLike)
      : attrName === "value"
        ? resolveOptionElement(elementLike)
        : resolveAnchorElement(elementLike)
  )

  const blockReason = blockReasonResolver?.(element)
  if (blockReason) return { changed: false, reason: blockReason }

  const rawUrl = String(element?.getAttribute?.(attrName) || "").trim()
  const absoluteUrl = resolveAbsoluteUrl(rawUrl)

  if (!absoluteUrl) {
    return {
      changed: false,
      reason: invalidReason,
      href: rawUrl
    }
  }

  if (!isTwGameUrl(absoluteUrl)) {
    return {
      changed: false,
      reason: "non-game-url",
      href: absoluteUrl.toString()
    }
  }

  const fixedUrl = withGroupFix(absoluteUrl, groupId, FORCE_GROUP_REWRITE_OPTIONS)
  if (!fixedUrl) {
    return {
      changed: false,
      reason: "invalid-fixed-href",
      href: absoluteUrl.toString()
    }
  }

  if (fixedUrl === absoluteUrl.toString()) {
    return {
      changed: false,
      reason: "unchanged",
      href: absoluteUrl.toString()
    }
  }

  element.setAttribute(attrName, fixedUrl)
  element.setAttribute(PATCH_ATTR, String(groupId))

  return {
    changed: true,
    reason: "rewritten",
    mode,
    group_id: Number(groupId),
    from_href: absoluteUrl.toString(),
    to_href: fixedUrl
  }
}

export const rewriteAnchorHrefDetailed = (anchorLike, groupId) => {
  return rewriteUrlAttributeDetailed({
    elementLike: anchorLike,
    attrName: "href",
    groupId,
    blockReasonResolver: getAnchorRewriteBlockReason,
    invalidReason: "invalid-anchor-href",
    mode: "href"
  })
}

export const rewriteAnchorHref = (anchorLike, groupId) => {
  return rewriteAnchorHrefDetailed(anchorLike, groupId).changed
}

export const rewriteFormActionDetailed = (formLike, groupId) => {
  return rewriteUrlAttributeDetailed({
    elementLike: formLike,
    attrName: "action",
    groupId,
    blockReasonResolver: getFormRewriteBlockReason,
    invalidReason: "invalid-form-action",
    mode: "action"
  })
}

export const rewriteFormAction = (formLike, groupId) => {
  return rewriteFormActionDetailed(formLike, groupId).changed
}

export const rewriteOptionValueDetailed = (optionLike, groupId) => {
  return rewriteUrlAttributeDetailed({
    elementLike: optionLike,
    attrName: "value",
    groupId,
    blockReasonResolver: getOptionRewriteBlockReason,
    invalidReason: "invalid-option-value",
    mode: "value"
  })
}

export const rewriteOptionValue = (optionLike, groupId) => {
  return rewriteOptionValueDetailed(optionLike, groupId).changed
}

export const rewriteAnchorsInRootDetailed = (root, groupId) => {
  if (!root || !Number.isFinite(Number(groupId))) {
    return {
      scanned: 0,
      rewritten: 0,
      skipped: {},
      samples: []
    }
  }

  const targets = []
  const anchor = resolveAnchorElement(root)
  if (anchor) targets.push(anchor)

  const form = resolveFormElement(root)
  if (form) targets.push(form)

  if (root instanceof Element || root instanceof Document || root instanceof DocumentFragment) {
    targets.push(...Array.from(root.querySelectorAll("a[href], form[action], option[value]")))
  }

  const uniqueTargets = Array.from(new Set(targets))

  const skipped = {}
  const samples = []

  const rewritten = uniqueTargets.reduce((count, currentTarget) => {
    let result = null

    try {
      result = currentTarget instanceof HTMLFormElement
        ? rewriteFormActionDetailed(currentTarget, groupId)
        : currentTarget instanceof HTMLOptionElement
          ? rewriteOptionValueDetailed(currentTarget, groupId)
          : rewriteAnchorHrefDetailed(currentTarget, groupId)
    } catch (error) {
      const reason = "rewrite-error"
      skipped[reason] = Number(skipped[reason] || 0) + 1

      if (samples.length < 5) {
        samples.push({
          mode: "error",
          href: String(
            currentTarget?.getAttribute?.("href")
            || currentTarget?.getAttribute?.("action")
            || currentTarget?.getAttribute?.("value")
            || ""
          ),
          error: error instanceof Error ? error.message : String(error || "unknown error")
        })
      }

      return count
    }

    if (result.changed) {
      if (samples.length < 5) {
        samples.push({
          mode: result.mode || "unknown",
          from_href: result.from_href,
          to_href: result.to_href
        })
      }

      return count + 1
    }

    const reason = String(result?.reason || "unknown")
    skipped[reason] = Number(skipped[reason] || 0) + 1
    return count
  }, 0)

  return {
    scanned: uniqueTargets.length,
    rewritten,
    skipped,
    samples
  }
}

export const rewriteAnchorsInRoot = (root, groupId) => {
  const result = rewriteAnchorsInRootDetailed(root, groupId)
  return Number(result?.rewritten || 0)
}

export const mountAnchorMutationObserver = ({
  getGroupFix
} = {}) => {
  const queuedRoots = new Set()
  let scheduled = false
  let disposed = false

  const flush = async () => {
    scheduled = false
    if (disposed) return

    const roots = Array.from(queuedRoots)
    queuedRoots.clear()

    let groupId = null
    try {
      groupId = await getGroupFix?.()
    } catch {
      return
    }

    if (!Number.isFinite(Number(groupId))) return

    roots.forEach((root) => {
      rewriteAnchorsInRoot(root, groupId)
    })
  }

  const queue = (root = document) => {
    if (disposed) return
    queuedRoots.add(root)
    if (scheduled) return
    scheduled = true
    queueMicrotask(() => {
      void flush()
    })
  }

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === "attributes") {
        queue(mutation.target)
        return
      }

      mutation.addedNodes.forEach((node) => {
        if (node instanceof Element) {
          queue(node)
        }
      })
    })
  })

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["href", "action", "value"]
  })

  queue(document)

  return {
    queue,
    disconnect: () => {
      disposed = true
      observer.disconnect()
      queuedRoots.clear()
    }
  }
}

export default {
  resolveAnchorElement,
  resolveFormElement,
  resolveOptionElement,
  rewriteAnchorHrefDetailed,
  rewriteAnchorHref,
  rewriteFormActionDetailed,
  rewriteFormAction,
  rewriteOptionValueDetailed,
  rewriteOptionValue,
  rewriteAnchorsInRootDetailed,
  rewriteAnchorsInRoot,
  mountAnchorMutationObserver
}
