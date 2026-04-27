import { MAX_PAGE_SIZE } from "./constants"
import { TableProduction } from "./parsers"
import { getPages, shouldUpdatePageSize } from "./pagination"
import {
  buildChangePageSizePayload,
  buildChangePageSizeUrl,
  buildProductionPageUrl
} from "./routes"
import { ProtectingBot } from "@toolkit-tw-bot/document"
import { assertNoGameUpdateOrBlockedRequest } from "../shared/assertNoGameUpdateOrBlockedRequest"

const toHtmlDocument = (textHtml = "") => new DOMParser().parseFromString(String(textHtml || ""), "text/html")

const sortByTotalResourcesAsc = (villages = []) => villages
  .map(village => [
    Number(village?.wood || 0) + Number(village?.stone || 0) + Number(village?.iron || 0),
    village
  ])
  .sort((a, b) => a[0] - b[0])
  .map(([, village]) => village)

const pushUniqueVillages = (list = [], seen = new Set(), villages = []) => {
  for (const village of list) {
    const id = Number(village?.id)

    if (!seen.has(id)) {
      seen.add(id)
      villages.push(village)
    }
  }
}

const assertNotProtected = ({ html, controller = null } = {}) => {
  if (!ProtectingBot["bot-protect-all-in-game"].active(html)) return

  controller?.stop({ cause: "protectingBot" })
  throw ProtectingBot.error()
}

const collectVillagesFromUrls = async ({
  controller,
  urls = [],
  seen = new Set(),
  villages = []
} = {}) => {
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

        assertNoGameUpdateOrBlockedRequest(html, { context: "table-production:page" })

        pushUniqueVillages(TableProduction(html), seen, villages)
      }
    })
  } catch (error) {
    if (captchaError) throw captchaError
    throw error
  }

  if (captchaError) {
    throw captchaError
  }
}

async function getPremiumProduction({ groupId = 0, controller = null } = {}) {
  if (!controller) {
    throw new Error("table-production controller unavailable")
  }

  await controller.ready()

  assertNotProtected({ html: document, controller })

  const firstResponse = await controller.fetchPages({
    urls: [buildProductionPageUrl({ groupId, page: -1 }).toString()]
  })

  let activeHtml = toHtmlDocument(firstResponse?.textHtml || "")

  assertNotProtected({ html: activeHtml, controller })
  assertNoGameUpdateOrBlockedRequest(activeHtml, { context: "table-production:first-page" })

  let { urls, numberPages, pageSize } = getPages(activeHtml)
  const seen = new Set()
  const villages = []

  if (shouldUpdatePageSize({
    numberPages,
    pageSize,
    maxPageSize: MAX_PAGE_SIZE
  })) {
    assertNotProtected({ html: document, controller })

    const resizedResponse = await controller.pageSize({
      url: buildChangePageSizeUrl({ groupId }).toString(),
      payload: buildChangePageSizePayload({ pageSize: MAX_PAGE_SIZE })
    })

    activeHtml = toHtmlDocument(resizedResponse?.textHtml || "")

    assertNotProtected({ html: activeHtml, controller })
    assertNoGameUpdateOrBlockedRequest(activeHtml, { context: "table-production:page-size" })

    const nextPages = getPages(activeHtml)
    urls = nextPages.urls
    numberPages = nextPages.numberPages
    pageSize = nextPages.pageSize
  }

  pushUniqueVillages(TableProduction(activeHtml), seen, villages)

  if (numberPages > 0 && urls.length) {
    await collectVillagesFromUrls({
      controller,
      urls,
      seen,
      villages
    })
  }

  return sortByTotalResourcesAsc(villages)
}

export {
  getPremiumProduction
}
