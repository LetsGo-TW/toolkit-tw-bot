import { iconClassFor, svgToDataUri } from '../util';

export const ICON_GLOBE = svgToDataUri(
  '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 24 24">' +
    '<circle cx="12" cy="12" r="8.5" fill="#fff" stroke="#111" stroke-width="1.6"/>' +
    '<ellipse cx="12" cy="12" rx="4.2" ry="8.1" fill="none" stroke="#111" stroke-width="1.2" opacity="0.9"/>' +
    '<path d="M3.8 12h16.4" stroke="#111" stroke-width="1.2" opacity="0.9"/>' +
    '<path d="M5.2 8.8c2.1 1.1 4.3 1.6 6.8 1.6s4.7-.5 6.8-1.6" fill="none" stroke="#111" stroke-width="1.0" opacity="0.55"/>' +
    '<path d="M5.2 15.2c2.1-1.1 4.3-1.6 6.8-1.6s4.7.5 6.8 1.6" fill="none" stroke="#111" stroke-width="1.0" opacity="0.55"/>' +
  '</svg>'
);

export const createBtnGlobe = (el, { size = 24, className = 'go-btn-cal', title = 'Mapa', onClick } = {}) => {
  const btn = document.createElement('button');
  const iconClass = iconClassFor(size);
  const inlineSize = iconClass ? '' : `style="width:${size}px;height:${size}px;"`
  btn.innerHTML = `<img src="${ICON_GLOBE}" class="${iconClass}" ${inlineSize} />`;
  btn.setAttribute('title', title);
  btn.setAttribute('class', className)
  if (typeof onClick === 'function') {
    btn.addEventListener('click', onClick);
  }
  el.insertAdjacentElement('beforeend', btn);
  return btn;
}
