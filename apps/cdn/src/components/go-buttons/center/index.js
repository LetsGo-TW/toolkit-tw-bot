import { iconClassFor, svgToDataUri } from '../util';

export const ICON_CENTER = svgToDataUri(
  '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 24 24">' +
    '<path d="M0 0h24v24H0z" fill="none"/>' +
    '<circle cx="12" cy="12" r="7.8" fill="#fff" stroke="#111" stroke-width="1.6"/>' +
    '<path d="M12 6.2v11.6M6.2 12h11.6" stroke="#111" stroke-width="1.6" stroke-linecap="round"/>' +
    '<path d="M12 9.2l.9 1.9 2.1.3-1.5 1.4.4 2.1-1.9-1-1.9 1 .4-2.1-1.5-1.4 2.1-.3z" fill="#111" opacity="0.75"/>' +
  '</svg>'
);

export const createBtnCenter = (el, { size = 24, className = 'go-btn-cal', title = 'Centralizar', onClick } = {}) => {
  const btn = document.createElement('button');
  const iconClass = iconClassFor(size);
  const inlineSize = iconClass ? '' : `style="width:${size}px;height:${size}px;"`
  btn.innerHTML = `<img src="${ICON_CENTER}" class="${iconClass}" ${inlineSize} />`;
  btn.setAttribute('title', title);
  btn.setAttribute('class', className)
  if (typeof onClick === 'function') {
    btn.addEventListener('click', onClick);
  }
  el.insertAdjacentElement('beforeend', btn);
  return btn;
}
