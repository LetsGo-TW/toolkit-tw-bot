import { copyToClipboardConfigInit } from '../config'
import { mountClipboardShadowRoot } from './shadowDom'

let currentSectionApi = null;

export async function getClipboardBadgeState() {
  const { copyToClipboardStorageLocal } = await copyToClipboardConfigInit()
  const config = await copyToClipboardStorageLocal.get() || {};
  
  // Verifica se alguma sub-ferramenta de cópia possui o campo active = true
  const isActive = Object.values(config).some(group => group && group.active === true);
  if (isActive) {
    return { statusLabel: 'Ativo', statusTone: 'active' };
  }
  return { statusLabel: 'Desligado', statusTone: 'danger' };
}

const onChange = async (e) => {
  const target = e?.target instanceof HTMLInputElement ? e.target : null
  const name = String(target?.name || '').trim()
  const checked = target?.checked
  e.stopPropagation();
  if (!name || typeof checked === 'undefined') return;
  const { copyToClipboardStorageLocal } = await copyToClipboardConfigInit()
  const [ id, item ] = name.split(':');
  const copyToClipboardConfig = await copyToClipboardStorageLocal.get();
  copyToClipboardConfig[id][item] = checked;
  await copyToClipboardStorageLocal.set(copyToClipboardConfig);

  if (currentSectionApi) {
    const badgeState = await getClipboardBadgeState();
    currentSectionApi.setStatus(badgeState.statusLabel, badgeState.statusTone);
  }
}

const initCopyConfigInputs = async (copyConfigNode) => {
  const copyConfigInputs = Array.from(copyConfigNode?.querySelectorAll('input[type="checkbox"]') || []);
  if (!copyConfigInputs.length) return;
  const { copyToClipboardStorageLocal } = await copyToClipboardConfigInit()
  const copyToClipboardConfig = await copyToClipboardStorageLocal.get();
  copyConfigInputs.forEach((e) => {
    const [ id, item ] = e.name.split(':');
    e.checked = copyToClipboardConfig?.[id]?.[item];
  })
}

export function insertConfigCopyToClipboard(mountTarget = null, sectionApi = null) {
  currentSectionApi = sectionApi;

  if (!mountTarget) {
    const existingRoot = document.querySelector('#go-config-copy-to-clipboard-shadow-host');
    if (existingRoot instanceof HTMLElement) {
      return () => {
        existingRoot.remove()
      };
    }
  }

  const goContainer = mountTarget || document.querySelector('#go_contairner');
  if (!goContainer) return () => {};

  const mounted = mountClipboardShadowRoot(goContainer)
  const rootNode = mounted?.host || null
  const copyConfigNode = mounted?.content || null
  const menu = mounted?.menu || null

  if (!(rootNode instanceof HTMLElement) || !(copyConfigNode instanceof HTMLElement) || !(menu instanceof HTMLElement)) {
    return () => {};
  }

  const menuOnClick = (event) => {
    event.preventDefault();
    if (copyConfigNode.classList.contains('show')) {
      copyConfigNode.classList.remove('show');
      copyConfigNode.removeEventListener('change', onChange, true);
    } else {
      copyConfigNode.classList.add('show');
      copyConfigNode.addEventListener('change', onChange, true);
    }
  }

  if (mountTarget) {
    menu.style.display = 'none';
    copyConfigNode.classList.add('show');
    copyConfigNode.addEventListener('change', onChange, true);
  } else {
    menu.addEventListener('click', menuOnClick);
  }

  initCopyConfigInputs(copyConfigNode);

  return () => {
    currentSectionApi = null;
    copyConfigNode.removeEventListener('change', onChange, true);
    menu.removeEventListener('click', menuOnClick);
    mounted?.destroy?.();
  }
}
