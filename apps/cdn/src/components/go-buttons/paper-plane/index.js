import { iconClassFor, svgToDataUri } from '../util';

export const ICON_PAPER_PLANE = svgToDataUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
    '<path d="M3 11.2 21 3.4l-6.9 17.2-2.9-6.4-8.2-3z" fill="#f4f4f4" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/>' +
    '<path d="M11.2 14.2 21 3.4" stroke="#111" stroke-width="1.6" stroke-linecap="round"/>' +
  '</svg>'
);

export const createBtnPaperPlane = (el, { size = 24, className = 'go-btn-cal', title = 'Enviar comandos', onClick } = {}) => {
  const btn = document.createElement('button');
  const iconClass = iconClassFor(size);
  const inlineSize = iconClass ? '' : `style="width:${size}px;height:${size}px;"`
  btn.innerHTML = `<img src="${ICON_PAPER_PLANE}" class="${iconClass}" ${inlineSize} />`;
  btn.setAttribute('title', title);
  btn.setAttribute('class', className)
  if (typeof onClick === 'function') {
    btn.addEventListener('click', onClick);
  }
  el.insertAdjacentElement('beforeend', btn);
  return btn;
}
