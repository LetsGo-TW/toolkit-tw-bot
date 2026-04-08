import { storageInputDateTime } from './config';
import { createDropdown } from '../dropdown';

async function renderItens(dd) {
  if (!dd) return
  dd.innerHTML = ''
  const config = await storageInputDateTime.get()
  if (!config?.values?.length) {
    dd.innerHTML = `<span class="go-dd-no-content">${'Vazio'}</span>`
    return
  }
  dd.innerHTML = config.values.reduce((text, e) => {
    text += `<span class="go-no-copy" data-datetime="${e}">${new Date(e).toLocaleString()}</span>`
    return text
  }, '');
}

export function dropdownDateTime(dateTimeContent) {
  const btn = dateTimeContent?.querySelector("#go-btn-time");
  const dd  = dateTimeContent?.querySelector("#go-time-dd");
  const box = dd?.parentElement; // ideal: container relative (go-dtbox)
  const datetimeEl = dateTimeContent?.querySelector('#go-date-time')
  if (!btn || !dd || !box || !datetimeEl) return;

  let api = null
  api = createDropdown({
    btn,
    menu: dd,
    matchSelector: 'span[data-datetime]',
    onOpen: async () => await renderItens(dd),
    onSelect: (item) => {
      const dt = item.dataset.datetime; // "2026-01-22T19:22:06"
      datetimeEl.value = dt
      api?.close()
    },
  })

  return api?.destroy
};
