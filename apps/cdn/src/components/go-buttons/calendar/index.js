import { iconClassFor, svgToDataUri } from '../util';

export const ICON_CALENDAR = svgToDataUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
    '<rect x="3" y="4" width="18" height="17" rx="2" ry="2" fill="#fff" stroke="#111" stroke-width="1.6"/>' +
    '<line x1="3" y1="9" x2="21" y2="9" stroke="#111" stroke-width="1.6"/>' +
    '<line x1="8" y1="2.8" x2="8" y2="6.5" stroke="#111" stroke-width="1.8" stroke-linecap="round"/>' +
    '<line x1="16" y1="2.8" x2="16" y2="6.5" stroke="#111" stroke-width="1.8" stroke-linecap="round"/>' +
    '<rect x="7" y="12" width="3" height="3" fill="#111"/>' +
    '<rect x="11" y="12" width="3" height="3" fill="#111" opacity="0.55"/>' +
    '<rect x="15" y="12" width="3" height="3" fill="#111" opacity="0.25"/>' +
  '</svg>'
);

export const createBtnCalendar = (el, { size = 24, className = 'go-btn-cal', title = 'Agendar comandos', onClick } = {}) => {
  const btn = document.createElement('button');
  const iconClass = iconClassFor(size);
  const inlineSize = iconClass ? '' : `style="width:${size}px;height:${size}px;"`
  btn.innerHTML = `<img src="${ICON_CALENDAR}" class="${iconClass}" ${inlineSize} />`;
  btn.setAttribute('title', title);
  btn.setAttribute('class', className)
  if (typeof onClick === 'function') {
    btn.addEventListener('click', onClick);
  }
  el.insertAdjacentElement('beforeend', btn);
  return btn;
}
