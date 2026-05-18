import Groups from "../groups"
import { ProtectingBot } from "@toolkit-tw-bot/document"
import { assertNoGameUpdateOrBlockedRequest } from "../shared/assertNoGameUpdateOrBlockedRequest"
import { gameData, getIsPremiumActive } from "./context"
import {
  DEFAULT_GROUP_ID,
  DEFAULT_SUMMARY,
  DEFAULT_TYPE,
  DEFAULT_USE_WORKER,
  MAX_PAGE_SIZE,
  normalizeTraderGroupId,
  normalizeTraderSummary,
  normalizeTraderType
} from "./constants"
import { getPages, shouldUpdatePageSize } from "./pagination"
import { parseTableTraderRows } from "./parser"
import {
  buildChangePageSizePayload,
  buildChangePageSizeUrl,
  buildRestoreGroupPayload,
  buildRestoreGroupUrl,
  buildTraderPageUrl
} from "./routes"
import { applyTableTraderSummary } from "./summary"
import { createTableTraderController } from "./worker-client"

const toHtmlDocument = (textHtml = "") => new DOMParser().parseFromString(String(textHtml || ""), "text/html")

const normalizeGroupNumber = (value = DEFAULT_GROUP_ID, fallback = DEFAULT_GROUP_ID) => {
  const n = Number(value)
  if (Number.isFinite(n)) return n
  return Number(fallback || DEFAULT_GROUP_ID)
}

const normalizeGetTableTraderArgs = (group_id = DEFAULT_GROUP_ID, options = {}) => {
  if (group_id && typeof group_id === "object") {
    return {
      groupId: normalizeTraderGroupId(group_id.groupId ?? group_id.group_id ?? DEFAULT_GROUP_ID),
      type: normalizeTraderType(group_id.type ?? DEFAULT_TYPE),
      summary: normalizeTraderSummary(group_id.summary ?? DEFAULT_SUMMARY),
      useWorker: typeof group_id.useWorker === "boolean" ? group_id.useWorker : DEFAULT_USE_WORKER,
      token: group_id.token || null,
      root: group_id.root || null
    }
  }

  return {
    groupId: normalizeTraderGroupId(group_id),
    type: normalizeTraderType(options?.type ?? DEFAULT_TYPE),
    summary: normalizeTraderSummary(options?.summary ?? DEFAULT_SUMMARY),
    useWorker: typeof options?.useWorker === "boolean" ? options.useWorker : DEFAULT_USE_WORKER,
    token: options?.token || null,
    root: options?.root || null
  }
}

const assertNotProtected = ({ html, controller = null } = {}) => {
  if (!ProtectingBot["bot-protect-all-in-game"].active(html)) return

  controller?.stop({ cause: "protectingBot" })
  throw ProtectingBot.error()
}

const collectRowsFromUrls = async ({
  controller,
  urls = [],
  type = DEFAULT_TYPE
} = {}) => {
  const rows = []
  let captchaError = null

  try {
    assertNotProtected({ html: document, controller })

    await controller.fetchPages({
      urls,
      onOcurrenceUpdate: ({ textHtml }) => {
        const html = toHtmlDocument(textHtml)

        if (ProtectingBot["bot-protect-all-in-game"].active(html)) {
          captchaError = ProtectingBot.error()
          controller.stop({ cause: "protectingBot" })
          return
        }

        assertNoGameUpdateOrBlockedRequest(html, { context: "table-trader:page" })

        rows.push(...parseTableTraderRows(html, { type }))
      }
    })
  } catch (error) {
    if (captchaError) throw captchaError
    throw error
  }

  if (captchaError) {
    throw captchaError
  }

  return rows
}

async function collectTableTraderRows(group_id = DEFAULT_GROUP_ID, options = {}) {
  const normalized = normalizeGetTableTraderArgs(group_id, options)
  const controller = await createTableTraderController(normalized)
  const groups = new Groups()
  const premiumActive = getIsPremiumActive()
  const savedGroup = normalizeGroupNumber(
    gameData.group_id,
    gameData.group_id
    // groups.save(),
  )
  let requestExecuted = false

  try {
    await controller.ready()

    assertNotProtected({ html: document, controller })

    const firstResponse = await controller.fetchPages({
      urls: [buildTraderPageUrl({
        groupId: normalized.groupId,
        type: normalized.type,
        page: -1
      }).toString()]
    })
    requestExecuted = true

    let activeHtml = toHtmlDocument(firstResponse?.textHtml || "")

    assertNotProtected({ html: activeHtml, controller })
    assertNoGameUpdateOrBlockedRequest(activeHtml, { context: "table-trader:first-page" })

    let { urls, numberPages, pageSize } = getPages(activeHtml)

    if (shouldUpdatePageSize({
      numberPages,
      pageSize,
      maxPageSize: MAX_PAGE_SIZE
    })) {
      assertNotProtected({ html: document, controller })

      const resizedResponse = await controller.pageSize({
        url: buildChangePageSizeUrl({
          groupId: normalized.groupId,
          type: normalized.type
        }).toString(),
        payload: buildChangePageSizePayload({ pageSize: MAX_PAGE_SIZE })
      })

      activeHtml = toHtmlDocument(resizedResponse?.textHtml || "")

      assertNotProtected({ html: activeHtml, controller })
      assertNoGameUpdateOrBlockedRequest(activeHtml, { context: "table-trader:page-size" })

      const nextPages = getPages(activeHtml)
      urls = nextPages.urls
      numberPages = nextPages.numberPages
      pageSize = nextPages.pageSize
    }

    const rows = parseTableTraderRows(activeHtml, { type: normalized.type })

    if (numberPages > 0 && urls.length) {
      rows.push(...await collectRowsFromUrls({
        controller,
        urls,
        type: normalized.type
      }))
    }

    return rows
  } catch (error) {
    console.error({ msg: error?.message || null, script: "collectTableTraderRows", error })
    throw error
  } finally {
    try {
      const shouldRestoreGroup = (
        premiumActive
        && requestExecuted
        && normalizeGroupNumber(normalized.groupId, DEFAULT_GROUP_ID) !== savedGroup
      )

      if (shouldRestoreGroup) {
        assertNotProtected({ html: document, controller })

        // await controller.restoreGroup({
        //   url: buildRestoreGroupUrl().toString(),
        //   payload: buildRestoreGroupPayload({ groupId: savedGroup })
        // })
      }
    } catch (restoreError) {
      console.warn("[collectTableTraderRows] group restore fail", restoreError?.message || restoreError)
    }

    controller.terminate()
  }
}

async function getTableTrader(group_id = DEFAULT_GROUP_ID, options = {}) {
  const normalized = normalizeGetTableTraderArgs(group_id, options)
  const rows = await collectTableTraderRows(normalized)

  return applyTableTraderSummary(rows, normalized.summary)
}

export {
  collectTableTraderRows,
  getTableTrader
}
