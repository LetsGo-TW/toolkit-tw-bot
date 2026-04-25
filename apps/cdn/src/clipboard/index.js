import { copyToClipboardConfigInit } from "./config";
import { normalizeDateTwString } from "../shared/normalizeDateTwString";
import { printMessage } from "../components/printMessage";

const RE_TIME = /(?<= )(?<hh>(?:0\d|1\d|2[0-3])):(?<mm>[0-5]\d)(?::(?<ss>[0-5]\d)(?:(?:[.:])(?<ms>\d{3}))?)?$/;
const RE_DATE_TIME_TW = /(?<= )(?<hh>(?:[01]\d|2[0-3])):(?<mm>[0-5]\d)(?::(?<ss>[0-5]\d)(?:(?<msSep>[:.])(?<sss>\d{3}))?)?$/;
const RE_DATETIME_TOKEN_GLOBAL =
  /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?(?:,\s*|\s+)(?:[01]\d|2[0-3]):[0-5]\d(?:\:[0-5]\d(?:[:.]\d{3})?)?\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b|\b(?:[01]\d|2[0-3]):[0-5]\d(?:\:[0-5]\d(?:[:.]\d{3})?)?\b/g;

async function tryCopy(text) {
  // 1) tenta Clipboard API
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {}

  // 2) tenta execCommand
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();

    const ok = document.execCommand("copy");
    ta.remove();
    if (ok) return;
  } catch {}

  throw new Error('The copy failed.')
}

function copyText(text) {
  if (!text) return null;
  return String(text).replace(/\s+/g, " ").trim();
}

export const parseTime = (str) => {
  const m = str.trim().match(RE_TIME);
  if (!m) return null;

  const { hh, mm, ss, ms } = m.groups;

  return {
    time: `${hh}:${mm}:${(ss ?? "00")}`,
    ms,
  };
}

export const copyToClipboard = async (text, print=true) => {
  try {
    await tryCopy(text);
    if (print) {
      printMessage.success(`📋 Copiado: ${text}`, 2000)
    }
  } catch (error) {
    if (print) {
      printMessage.error(`${error.toString()}`, 2000)
    }
    console.error(error)
  }
}

export function looksLikeDateOrTime(s) {
  s = String(s).trim();

  // data: 27/01/2026 ou 27/01
  if (/^\d{2}\/\d{2}(?:\/\d{4})?$/.test(s)) return true;

  // hora: 11:01 | 11:01:01 | 11:01:01:000 | 11:01:01.000
  if (/^(?:[01]\d|2[0-3]):[0-5]\d(?:\:[0-5]\d(?:[:.]\d{3})?)?$/.test(s)) return true;

  // datetime padrão seu: "27/01/2026, 11:01:01:000" etc
  if (/^\d{2}\/\d{2}(?:\/\d{4})?,\s*(?:[01]\d|2[0-3]):[0-5]\d(?:\:[0-5]\d(?:[:.]\d{3})?)?$/.test(s)) return true;

  return false;
}

function extractDateTimeTokensFromText(text = "") {
  const source = String(text || "");
  const tokens = source.match(RE_DATETIME_TOKEN_GLOBAL) || [];
  const seen = new Set();
  const unique = [];
  for (const token of tokens) {
    const normalized = String(token || "").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(normalized);
  }
  return unique;
}

export async function copyToClipboardInit () {
  const { copyToClipboardStorageLocal } = await copyToClipboardConfigInit()

  document.addEventListener('click', async (e) => {
    if (!e.isTrusted) return;
    if (e.target.id === "ds_body") return;
    if (e.target.id === "content_value") return;
    //** classe para não copiar */
    if (e.target.className?.includes('go-no-copy')) return;
    e.stopImmediatePropagation?.();
    e.stopPropagation();

    const copyToClipboardConfig = await copyToClipboardStorageLocal.get();

    const text = e.target.innerText.replaceAll('/n', '').trim();

    // 1) tenta copiar o texto “do TW” sob o cursor/seleção
    // (bom pra table/células/linhas)
    const selection = window.getSelection?.();
    const selected = selection && selection.toString ? selection.toString().trim() : "";
    if (selected && copyToClipboardConfig.datetime.active) {
      const selectedText = copyText(selected);
      const selectedTokens = extractDateTimeTokensFromText(selectedText);
      if (selectedTokens.length) {
        const raw = selectedTokens.join(" | ");
        await copyToClipboard(raw, copyToClipboardConfig?.datetime?.print);
        window.getSelection()?.removeAllRanges(); // ✅ limpa highlight
        return;
      }
    }

    // tenta o texto do elemento clicado (ex: td, span)
    if (text.match(RE_DATE_TIME_TW) && copyToClipboardConfig.datetime.active) {
      let date
      try {
        date = normalizeDateTwString(text);
      } catch {}
      const parsed = parseTime(text);
      if (!parsed && !date) {
        return;
      }
      const time = parsed?.time
      const ms = parsed?.ms
      const raw = date ? text : `${time}${ms ? `:${ms}` : ''}`
      await copyToClipboard(raw, copyToClipboardConfig?.datetime?.print);
      return;
    }

    if (text && looksLikeDateOrTime(text) && copyToClipboardConfig.datetime.active) {
      await copyToClipboard(text, copyToClipboardConfig?.datetime?.print);
      return;
    }

    const rawSel = selected?.match(/\b\d{2,3}\|\d{2,3}\b/)
    if (rawSel && copyToClipboardConfig.coords.active) {
      await copyToClipboard(copyText(rawSel), copyToClipboardConfig?.coords?.print);
      window.getSelection()?.removeAllRanges(); // ✅ limpa highlight
      return;
    }

    const rawText = text.match(/\b\d{2,3}\|\d{2,3}\b/)
    if (rawText && copyToClipboardConfig.coords.active) {
      if (copyToClipboardConfig.coords?.selectionOnly) return;
      await copyToClipboard(rawText, copyToClipboardConfig?.coords?.print)
      return;
    }
  })
};
