import { copyToClipboardConfigInit } from '../config'
import { mountClipboardShadowRoot } from './shadowDom'

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

export function insertConfigCopyToClipboard() {
  const existingRoot = document.querySelector('#go-config-copy-to-clipboard-shadow-host');
  if (existingRoot instanceof HTMLElement) {
    return () => {
      existingRoot.remove()
    };
  }

  const goContainer = document.querySelector('#go_contairner');
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

  menu.addEventListener('click', menuOnClick);
  initCopyConfigInputs(copyConfigNode);

  return () => {
    copyConfigNode.removeEventListener('change', onChange, true);
    mounted?.destroy?.();
  }
}
