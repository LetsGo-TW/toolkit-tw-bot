// Components/input-date-time/index.js
import "./index.css";
import inputDateTimeTextHtml from "./index.html";
import { storageInputDateTime } from "./config";
import { dropdownDateTime } from "./dropdown";
import { copyToClipboard, parseTime } from "../../clipboard";
import { normalizeDateTwString } from "../../shared/normalizeDateTwString";
import { useGoTiming } from "../../hooks/useGoTiming";

const DEFAULT_ADDITION_SECOND = 3600;

function formatServerClock(nowMs = Date.now()) {
  const d = new Date(nowMs);
  const pad = (n, size = 2) => String(n).padStart(size, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function isValidInputDateTimeValue(dateTime) {
  const time = new Date(dateTime).getTime();
  return time + 60 * 1000 > useGoTiming.getEffectiveServerNowMs();
}

function stopMapHotkeysOnInput(inputEl) {
  function onKeyDown(e) {
    // bloqueia o mapa, mas deixa o input trabalhar
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      // NÃO usa preventDefault aqui
    }
  }

  inputEl.addEventListener("keydown", onKeyDown, false); // bubble
  return () => inputEl.removeEventListener("keydown", onKeyDown, false);
}

export function formatDateTime(time = Date.now()) {
  const d = new Date(time);
  const yyyy = d.getFullYear().toString();
  const MM = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}-${MM}-${dd}T${hh}:${mm}:${ss}`;
}

export function formatTwFromDatetimeLocal(
  value,
  {
    withSeconds = true,
    ms = null,
    msSep = ":",
    dateStyle = "tw_pt", // "tw_pt" | "tw_en"
  } = {}
) {
  const m = String(value).match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
  );
  if (!m) return null;

  const [, yyyy, MM, dd, hh, mm, ss] = m;

  const hasMs = ms !== null && ms !== undefined && String(ms).trim() !== "";
  const forceSeconds = withSeconds || hasMs;
  const s = forceSeconds ? ss ?? "00" : null;

  // mês abreviado estilo "jan." (TW) (EN)
  const MONTH_TW_EN = [
    "jan.",
    "feb.",
    "mar.",
    "apr.",
    "may",
    "jun.",
    "jul.",
    "aug.",
    "sep.",
    "oct.",
    "nov.",
    "dec.",
  ];
  const mon = MONTH_TW_EN[Number(MM) - 1] ?? MM;

  const datePart =
    dateStyle === "tw_en"
      ? `${mon} ${Number(dd)}, ${yyyy}` // "jan. 30, 2026"
      : `${dd}/${MM}/${yyyy}`; // "30/01/2026"

  let out = forceSeconds
    ? `${datePart} ${hh}:${mm}:${s}`
    : `${datePart} ${hh}:${mm}`;

  if (hasMs) {
    out += `${msSep}${ms3(ms)}`;
  }

  return out;
}

function dmyToYmd(date) {
  if (!date) return null;
  const m = String(date).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, MM, yyyy] = m;
  return `${yyyy}-${MM}-${dd}`;
}

function normalizeTime(time) {
  if (!time) return null;
  const m = String(time).match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [, hh, mm, ss] = m;
  return `${hh}:${mm}:${ss ?? "00"}`;
}

function splitDTValue(v) {
  const s = String(v || "");
  const hasT = s.includes("T");
  return {
    date: hasT ? s.split("T")[0] : "",
    time: hasT ? s.split("T")[1] : "",
  };
}

function getMsStepGroup(fromEl) {
  const box = fromEl.closest(".go-msbox");
  if (!box) return {};
  const inputMS = box.querySelector("#go-ms");
  return { box, inputMS };
}

/* ======= Normalizers (sem repetição) ======= */

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

function toIntDigits(v, fallback = 0) {
  const n = Number(String(v ?? "").replace(/\D/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

function msNormalize(v) {
  const n = Math.abs(toIntDigits(v, 0));
  return n % 1000;
}

function ms3(v) {
  return String(msNormalize(v)).padStart(3, "0");
}

function msFromInput(v) {
  return msNormalize(v);
}

// ms vindo do clipboard: se não tiver, null; se tiver, "000".."999"
function msFromClipboard(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = clamp(toIntDigits(s, 0), 0, 999);
  return String(n).padStart(3, "0");
}

// step: sempre número 5..100
function stepFromInput(v) {
  const n = toIntDigits(v, 10) || 10;
  return clamp(n, 5, 100);
}

/* ======= Handlers ======= */

async function onChangeDateTime(e) {
  e.preventDefault();
  e.stopPropagation();

  const input = e.target;
  const box = input?.closest(".go-dtbox");
  if (!input || !box) return;

  const dateTimeValue = input.value;
  const elError = box.querySelector(".go-dtbox-error");

  if (!isValidInputDateTimeValue(dateTimeValue)) {
    if (elError) elError.classList.add("show");

    box.dispatchEvent(
      new CustomEvent("go:datetime:change", {
        bubbles: true,
        detail: { value: dateTimeValue },
      })
    );
    return;
  }

  if (elError) elError.classList.remove("show");

  const configInputDateTime = await storageInputDateTime.get() || {};
  configInputDateTime.value = dateTimeValue;
  await storageInputDateTime.set(configInputDateTime);

  box.dispatchEvent(
    new CustomEvent("go:datetime:change", {
      bubbles: true,
      detail: { value: dateTimeValue },
    })
  );
}

// datetime grupo
async function onClickCopy(e) {
  e.preventDefault();
  e.stopPropagation();

  const btn = e.target.closest("#go-btn-copy");
  if (!btn) return;

  const box = btn.closest(".go-dtbox");
  const input = box?.querySelector('input[type="datetime-local"]');
  if (!input) return;

  const value = input.value;
  if (!value) return;

  // ms pode estar fora do box em alguns layouts, então tenta nos dois
  const msEl =
    box.querySelector("#go-ms") ||
    box.parentElement?.querySelector("#go-ms");
  const ms = msEl?.value ?? null;

  const text = formatTwFromDatetimeLocal(input.value, {
    withSeconds: true,
    ms,
    msSep: ":",
  });
  if (!text) throw new Error("Invalid datetime-local.");

  await copyToClipboard(text);
}

async function onClickPaste(e) {
  e.preventDefault();
  e.stopPropagation();

  const btn = e.target.closest("#go-btn-paste");
  if (!btn) return;

  const box = btn.closest(".go-dtbox");
  if (!box) return;

  const inputDT = box.querySelector('input[type="datetime-local"]');
  if (!inputDT) return;

  const elError = box.querySelector(".go-dtbox-error");

  let value = inputDT.value; // pode estar vazio
  let raw = "";

  try {
    raw = await navigator.clipboard.readText();
  } catch {
    if (elError) {
      elError.textContent = "Sem permissão para ler o clipboard.";
      elError.classList.add("show");
    }
    return;
  }

  // tenta pegar data TW (silencioso se não for)
  let dateDMY = null;
  try {
    dateDMY = normalizeDateTwString(raw);
  } catch {}

  const dateYMD = dmyToYmd(dateDMY);

  const parsed = parseTime(raw) || {};
  const timeHMS = normalizeTime(parsed?.time);

  // ms do clipboard: "000".."999" ou null
  const msClip = msFromClipboard(parsed?.ms);

  // se não achou nada, não mexe
  if (!dateYMD && !timeHMS && !msClip) {
    if (elError) {
      elError.textContent = "Clipboard não tem data/hora do TW.";
      elError.classList.add("show");
    }
    return;
  }

  const cur = splitDTValue(value);
  const nextDate = dateYMD ?? cur.date ?? "";
  const nextTime = timeHMS ?? cur.time ?? "";

  // monta novo value preservando o que não veio
  if (nextDate && nextTime) {
    value = `${nextDate}T${nextTime}`;
  } else if (nextDate && !nextTime) {
    value = `${nextDate}T${cur.time || "00:00:00"}`;
  } else if (!nextDate && nextTime) {
    if (cur.date) value = `${cur.date}T${nextTime}`;
  }

  // aplica datetime-local
  if (value && value.includes("T")) {
    inputDT.value = value;
    // inputDT.dispatchEvent(new Event("input", { bubbles: true }));
    inputDT.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // aplica ms (pode estar 1 nível acima)
  if (msClip) {
    const group = box.parentElement;
    const inputMS = group?.querySelector("#go-ms");
    if (inputMS) {
      inputMS.value = msClip;
      // inputMS.dispatchEvent(new Event("input", { bubbles: true }));
      inputMS.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  if (elError) elError.classList.remove("show");
}

// millis grupo
async function onChangeMillis(e) {
  e.preventDefault();
  e.stopPropagation();

  const input = e.target;
  if (!input) return;

  input.value = ms3(input.value);

  const cfg = await storageInputDateTime.get() || {};
  cfg.ms = input.value;
  await storageInputDateTime.set(cfg);
}

async function onClickDec(e) {
  e.preventDefault();
  e.stopPropagation();

  const btn = e.target.closest("#go-ms-step-dec");
  if (!btn) return;

  const { inputMS } = getMsStepGroup(btn);
  if (!inputMS) return;

  const step = stepFromInput(await storageInputDateTime.get()?.step ?? 10);
  const cur = msFromInput(inputMS.value);

  inputMS.value = ms3(cur - step);
  inputMS.dispatchEvent(new Event("change", { bubbles: true }));
}

async function onClickInc(e) {
  e.preventDefault();
  e.stopPropagation();

  const btn = e.target.closest("#go-ms-step-inc");
  if (!btn) return;

  const { inputMS } = getMsStepGroup(btn);
  if (!inputMS) return;

  const step = stepFromInput(await storageInputDateTime.get()?.step ?? 10);
  const cur = msFromInput(inputMS.value);

  inputMS.value = ms3(cur + step);
  inputMS.dispatchEvent(new Event("change", { bubbles: true }));
}

async function onChangeStep(e) {
  e.preventDefault();
  e.stopPropagation();

  const input = e.target;
  if (!input) return;

  const stepNum = stepFromInput(input.value);
  input.value = String(stepNum);

  const cfg = await storageInputDateTime.get() || {};
  cfg.step = stepNum; // salva number
  await storageInputDateTime.set(cfg);
}

export async function inputDateTimeView(
  dateTimeContent = document,
  additionDefault = DEFAULT_ADDITION_SECOND,
  options = {}
) {
  if (!dateTimeContent) return;

  dateTimeContent.insertAdjacentHTML("beforeend", inputDateTimeTextHtml);

  // init
  const cfg = await storageInputDateTime.get() || {};

  const inputDataTime = dateTimeContent.querySelector(
    'input[type="datetime-local"]'
  );
  if (!inputDataTime) return;
  const dateTimeRoot = dateTimeContent.querySelector("#go-dtgrp");
  const serverClockOverlay = dateTimeContent.querySelector("#go-server-clock-overlay");
  const inputDateTimeLabel = dateTimeContent.querySelector('label[for="go-date-time"]');
  const normalizeMode = (mode) => (String(mode || '').trim().toLowerCase() === 'send' ? 'send' : 'schedule');
  let currentMode = 'schedule';
  let currentDisabled = false;
  let unsubscribeServerClock = null;
  const startServerClock = () => {
    if (!serverClockOverlay) return;
    if (unsubscribeServerClock) unsubscribeServerClock();
    unsubscribeServerClock = useGoTiming.subscribe(() => {
      serverClockOverlay.textContent = `Hora do servidor: ${formatServerClock(useGoTiming.getEffectiveServerNowMs())}`;
    }, { immediate: true });
  };
  const stopServerClock = () => {
    if (unsubscribeServerClock) {
      unsubscribeServerClock();
      unsubscribeServerClock = null;
    }
  };
  const setMode = (mode = 'schedule') => {
    currentMode = normalizeMode(mode);
    const isSend = currentMode === 'send';
    if (inputDateTimeLabel) inputDateTimeLabel.textContent = isSend ? 'Saída' : 'Chegada';
    inputDataTime.setAttribute('data-title', isSend ? 'Data e hora de saída' : 'Data e hora de chegada');
  };
  const setDisabled = (disabled = false) => {
    currentDisabled = Boolean(disabled);
    if (dateTimeRoot) dateTimeRoot.classList.toggle("is-disabled", currentDisabled);
    const controls = dateTimeRoot
      ? Array.from(dateTimeRoot.querySelectorAll('input, button, select, textarea'))
      : [];
    controls.forEach((el) => {
      if (!el || el === null) return;
      if ('disabled' in el) el.disabled = currentDisabled;
    });
    if (serverClockOverlay) {
      if (currentDisabled) {
        if (!dateTimeContent.style.position) dateTimeContent.style.position = "relative";
        serverClockOverlay.hidden = false;
        startServerClock();
      } else {
        serverClockOverlay.hidden = true;
        stopServerClock();
      }
    }
  };

  const dispatchDateTimeChange = (value) => {
    if (!dateTimeRoot) return
    dateTimeRoot.dispatchEvent(
      new CustomEvent("go:datetime:change", {
        bubbles: true,
        detail: { value },
      })
    )
  }

  const applyDateTimeValue = async (nextValue, {
    persist = true,
    emit = true
  } = {}) => {
    const value = String(nextValue || "").trim()
    if (!value) return false
    inputDataTime.value = value
    const elError = dateTimeRoot?.querySelector?.(".go-dtbox-error") || null
    const isValid = isValidInputDateTimeValue(value)
    if (elError) elError.classList.toggle("show", !isValid)
    if (persist && isValid) {
      const configInputDateTime = await storageInputDateTime.get() || {}
      configInputDateTime.value = value
      await storageInputDateTime.set(configInputDateTime)
    }
    if (emit) dispatchDateTimeChange(value)
    return true
  }

  inputDataTime.value =
    cfg.value || formatDateTime(useGoTiming.getEffectiveServerNowMs() + additionDefault * 1000);
  const initialValue = String(options?.initialValue || '').trim()
  if (initialValue) {
    applyDateTimeValue(initialValue, { persist: false, emit: false })
  }

  const btnCalendar = dateTimeContent.querySelector("#go-btn-cal");

  const openPicker = () => {
    inputDataTime?.showPicker?.();
  };

  if (!inputDataTime.showPicker) {
    btnCalendar?.remove();
  }

  const dropdownDateTimeClose = dropdownDateTime(dateTimeContent);

  const btnCopy = dateTimeContent.querySelector("#go-btn-copy");
  const btnPaste = dateTimeContent.querySelector("#go-btn-paste");

  const btnMilisSetpDec = dateTimeContent.querySelector("#go-ms-step-dec");
  const inputMilis = dateTimeContent.querySelector("#go-ms");

  const btnMilisSetpInc = dateTimeContent.querySelector("#go-ms-step-inc");
  const inputStep = dateTimeContent.querySelector("#go-ms-step");

  if (inputMilis) inputMilis.value = ms3(cfg.ms ?? "000");
  if (inputStep) inputStep.value = String(stepFromInput(cfg.step ?? 10));

  // listeners
  const unbindTrapArrows = stopMapHotkeysOnInput(inputDataTime);

  inputDataTime.addEventListener("change", onChangeDateTime, true);
  btnCalendar?.addEventListener("click", openPicker, true);
  btnCopy?.addEventListener("click", onClickCopy, true);
  btnPaste?.addEventListener("click", onClickPaste, true);

  btnMilisSetpDec?.addEventListener("click", onClickDec, true);
  inputMilis?.addEventListener("change", onChangeMillis, true);
  btnMilisSetpInc?.addEventListener("click", onClickInc, true);

  inputStep?.addEventListener("change", onChangeStep, true);
  setMode('schedule');

  // close all listeners
  const inputDateTimeClose = () => {
    stopServerClock();
    dropdownDateTimeClose?.();
    unbindTrapArrows?.();

    inputDataTime.removeEventListener("change", onChangeDateTime, true);
    btnCalendar?.removeEventListener("click", openPicker, true);
    btnCopy?.removeEventListener("click", onClickCopy, true);
    btnPaste?.removeEventListener("click", onClickPaste, true);

    btnMilisSetpDec?.removeEventListener("click", onClickDec, true);
    inputMilis?.removeEventListener("change", onChangeMillis, true);
    btnMilisSetpInc?.removeEventListener("click", onClickInc, true);

    inputStep?.removeEventListener("change", onChangeStep, true);
  };

  return {
    inputDateTimeClose,
    dateTimeValue: inputDataTime.value,
    setValue: (value, opts) => applyDateTimeValue(value, opts),
    getValue: () => String(inputDataTime?.value || ''),
    setMode,
    getMode: () => currentMode,
    setDisabled,
    isDisabled: () => currentDisabled
  };
}
