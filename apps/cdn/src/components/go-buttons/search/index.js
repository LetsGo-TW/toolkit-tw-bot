import { iconClassFor, svgToDataUri } from '../util';

export const ICON_SEARCH = svgToDataUri(
  '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 24 24">' +
    '<circle cx="11" cy="11" r="6.8" fill="#fff" stroke="#111" stroke-width="1.6"/>' +
    '<circle cx="9.2" cy="9.2" r="2.1" fill="#111" opacity="0.10"/>' +
    '<line x1="16.6" y1="16.6" x2="21" y2="21" stroke="#fff" stroke-width="4.2" stroke-linecap="round"/>' +
    '<line x1="16.6" y1="16.6" x2="21" y2="21" stroke="#111" stroke-width="2.2" stroke-linecap="round"/>' +
  '</svg>'
);

export const createBtnSearch = (el, { size = 24, className = 'go-btn-cal', title = 'Buscar', onClick } = {}) => {
  const btn = document.createElement('button');
  const iconClass = iconClassFor(size);
  const inlineSize = iconClass ? '' : `style="width:${size}px;height:${size}px;"`
  btn.innerHTML = `<img src="${ICON_SEARCH}" class="${iconClass}" ${inlineSize} />`;
  btn.setAttribute('title', title);
  btn.setAttribute('class', className)
  if (typeof onClick === 'function') {
    btn.addEventListener('click', onClick);
  }
  el.insertAdjacentElement('beforeend', btn);
  return btn;
}
