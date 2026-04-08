import { iconClassFor, svgToDataUri } from '../util';

export const ICON_LIGHTNING_ARROW = svgToDataUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
    '<path d="m13.3 2.2-4.8 7h3.6l-2 6.2 5.2-7.6h-3.4z" fill="#f6cf3c" stroke="#111" stroke-width="1.3" stroke-linejoin="round"/>' +
    '<path d="M3 18.8h12.2" stroke="#111" stroke-width="1.8" stroke-linecap="round"/>' +
    '<path d="m11.5 16 3.7 2.8-3.7 2.9z" fill="#fff" stroke="#111" stroke-width="1.3" stroke-linejoin="round"/>' +
  '</svg>'
);

export const createBtnLightningArrow = (el, { size = 24, className = 'go-btn-cal', title = 'Enviar comandos', onClick } = {}) => {
  const btn = document.createElement('button');
  const iconClass = iconClassFor(size);
  const inlineSize = iconClass ? '' : `style="width:${size}px;height:${size}px;"`
  btn.innerHTML = `<img src="${ICON_LIGHTNING_ARROW}" class="${iconClass}" ${inlineSize} />`;
  btn.setAttribute('title', title);
  btn.setAttribute('class', className)
  if (typeof onClick === 'function') {
    btn.addEventListener('click', onClick);
  }
  el.insertAdjacentElement('beforeend', btn);
  return btn;
}
