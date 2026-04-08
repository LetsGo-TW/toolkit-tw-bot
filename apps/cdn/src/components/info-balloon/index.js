import "./index.css";

export function createInfoBalloon({
  mountEl,
  icon = "!",
  iconSvg = "",
  title = "Aviso",
  text = "",
  badgeTitle = "O que é isto?",
  auto = true,
  autoOpenFirst = true,
  className = "",
} = {}) {
  if (!mountEl) return null;

  const state = {
    open: false,
    visible: false,
    seen: false,
    auto: Boolean(auto),
  };

  const root = document.createElement("span");
  root.className = `go-info-balloon ${className}`.trim();

  const badge = document.createElement("button");
  badge.type = "button";
  badge.className = "go-info-balloon-badge";
  badge.setAttribute("aria-label", badgeTitle);
  badge.dataset.title = badgeTitle;
  if (String(iconSvg || "").trim()) {
    badge.innerHTML = iconSvg;
  } else {
    const iconText = document.createElement("span");
    iconText.className = "go-info-balloon-icon-text";
    iconText.textContent = icon;
    badge.appendChild(iconText);
  }

  const panel = document.createElement("div");
  panel.className = "go-info-balloon-panel";
  panel.innerHTML = `
    <button type="button" class="go-info-balloon-close" aria-label="Fechar">×</button>
    <div class="go-info-balloon-title"></div>
    <div class="go-info-balloon-text"></div>
  `;

  const titleEl = panel.querySelector(".go-info-balloon-title");
  const textEl = panel.querySelector(".go-info-balloon-text");
  const closeBtn = panel.querySelector(".go-info-balloon-close");

  if (titleEl) titleEl.textContent = title;
  if (textEl) textEl.textContent = text;

  root.appendChild(badge);
  root.appendChild(panel);
  mountEl.appendChild(root);

  const applyVisibility = () => {
    root.style.display = state.visible ? "inline-flex" : "none";
    panel.style.display = state.visible && state.open ? "block" : "none";
    badge.classList.toggle("is-open", state.visible && state.open);
  };

  const open = () => {
    state.visible = true;
    state.open = true;
    state.seen = true;
    applyVisibility();
  };

  const close = () => {
    state.open = false;
    applyVisibility();
  };

  const toggle = () => {
    if (state.open) close();
    else open();
  };

  const setText = (nextText = "") => {
    if (textEl) textEl.textContent = String(nextText || "");
  };

  const setTitle = (nextTitle = "") => {
    if (titleEl) titleEl.textContent = String(nextTitle || "");
  };

  const show = ({ title: nextTitle, text: nextText, auto: nextAuto } = {}) => {
    if (nextTitle !== undefined) setTitle(nextTitle);
    if (nextText !== undefined) setText(nextText);
    state.visible = true;
    const shouldAuto = nextAuto === undefined ? state.auto : Boolean(nextAuto);
    if (autoOpenFirst && shouldAuto && !state.seen) {
      open();
      state.auto = false;
      return;
    }
    applyVisibility();
  };

  const hide = ({ closePanel = true } = {}) => {
    if (closePanel) state.open = false;
    state.visible = false;
    applyVisibility();
  };

  const onClickBadge = (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    toggle();
  };

  const onClickClose = (event) => {
    event.preventDefault();
    event.stopPropagation();
    close();
  };

  const onPointerDownOutside = (event) => {
    if (!state.open) return;
    if (root.contains(event.target)) return;
    close();
  };

  const onEsc = (event) => {
    if (!state.open) return;
    const isEsc = event.key === "Escape" || event.key === "Esc" || event.keyCode === 27;
    if (!isEsc) return;
    close();
  };

  badge.addEventListener("click", onClickBadge, true);
  closeBtn?.addEventListener("click", onClickClose, true);
  document.addEventListener("pointerdown", onPointerDownOutside, true);
  document.addEventListener("keydown", onEsc, true);

  hide({ closePanel: true });

  const destroy = () => {
    badge.removeEventListener("click", onClickBadge, true);
    closeBtn?.removeEventListener("click", onClickClose, true);
    document.removeEventListener("pointerdown", onPointerDownOutside, true);
    document.removeEventListener("keydown", onEsc, true);
    root.remove();
  };

  return {
    open,
    close,
    toggle,
    show,
    hide,
    setText,
    setTitle,
    destroy,
    getState: () => ({ ...state }),
  };
}

export default createInfoBalloon;
