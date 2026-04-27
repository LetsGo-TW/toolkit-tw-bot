import { TableProductionNotPremium } from "./parsers"
import { getOverviewVillagesHtml } from "./http"
import { ProtectingBot } from "@toolkit-tw-bot/document"

async function getNonPremiumProduction() {
  const html = await getOverviewVillagesHtml()

  if (ProtectingBot["bot-protect-all-in-game"].active(html)) {
    throw ProtectingBot.error()
  }

  return TableProductionNotPremium(html)
}

export {
  getNonPremiumProduction
}
