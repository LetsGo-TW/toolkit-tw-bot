import './style.css'
import copyToClipboardTextHtml from './index.html'
import { copyToClipboardConfigInit } from '../config'
import { inputDateTimeView } from '../../components/input-date-time'

const onChange = async (e) => {
  const { copyToClipboardStorageLocal } = await copyToClipboardConfigInit()
  const { name, checked } = e.target;
  e.stopPropagation();
  if (!name || typeof checked === 'undefined') return;
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
  const goContainer = document.querySelector('#go_contairner');
  if (!goContainer) return;
  goContainer.insertAdjacentHTML('beforeend', copyToClipboardTextHtml);
  const copyConfigNode = document.querySelector("#go-config-copy-to-clipboard-content");
  const menuOnClick = () => {
    const content = document.querySelector('#go-config-copy-to-clipboard-content');
    if (content.className) {
      content.removeAttribute('class');
      copyConfigNode.removeEventListener('change', onChange, true);
    } else {
      content.setAttribute('class', 'show');
      copyConfigNode.addEventListener('change', onChange, true);
    }
  }
  const menu = document.querySelector('#go-config-copy-to-clipboard-menu');
  menu.addEventListener('click', menuOnClick);
  initCopyConfigInputs(copyConfigNode);
  inputDateTimeView(document.querySelector('#go-dtgrp-content'))
}
