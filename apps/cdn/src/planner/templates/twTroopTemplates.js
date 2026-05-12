import { getPlaceTemplates } from "../../requests/getPlaceTemplates";

function normalizeLooseObjectLiteralToJson(raw) {
  return String(raw || '')
    .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
    .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, inner) => JSON.stringify(
      inner
        .replace(/\\\\/g, '\\')
        .replace(/\\'/g, "'"),
    ))
    .replace(/,\s*([}\]])/g, '$1')
}

function parseTroopTemplatesFromText(text) {
  if (!text) return null
  const m = text.match(/TroopTemplates\.current\s*=\s*(\{[\s\S]*?\});/)
  if (!m) return null
  const raw = m[1]
  try {
    return Object.values(JSON.parse(raw))
  } catch {
    try {
      return Object.values(JSON.parse(normalizeLooseObjectLiteralToJson(raw)))
    } catch {
      return null
    }
  }
}

function parseTroopTemplatesFromDocument(doc = document) {
  const scripts = Array.from(doc.scripts || [])
  const scr = scripts.find((el) =>
    el?.textContent?.includes('TroopTemplates.current')
  )
  if (!scr) return null
  return parseTroopTemplatesFromText(scr.textContent)
}

function isScreen(screen) {
}

async function getTwTroopTemplates({ signal } = {}) {
  let twTroopTemplates;
  const url = new URL(location.href)
  const isScreen = (screen) => url.searchParams.get('screen') === screen;
  if (isScreen('map') &&'TWMap' in window) {
    twTroopTemplates = Object.values(TWMap.troop_templates)
  } else if ('TroopTemplates' in window && window.TroopTemplates.current) {
    twTroopTemplates = Object.values(window.TroopTemplates.current)
  } else {
    twTroopTemplates = parseTroopTemplatesFromDocument(document)
  }

  if (twTroopTemplates) return twTroopTemplates;

  try {
    if (signal?.aborted) return null
    const doc = await getPlaceTemplates({ signal });
    const parsedDoc = parseTroopTemplatesFromDocument(doc)
    if (parsedDoc?.length) return parsedDoc
  } catch (error) {
    console.error(error)
  }

  return twTroopTemplates;
}

export { getTwTroopTemplates }
