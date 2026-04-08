import { iconClassFor, svgToDataUri } from '../util';

const SWORDS_PATH =
  'M6.1 4.5 L8.1 4.5 L14.1 10.5 L20.1 4.5 L22.1 4.5 L22.1 6.5 L16.1 12.5 L17.1 13.5 L18.1 12.5 L19.1 13.5 L17.9 14.7 L19.9 16.7 L18.5 18.1 L16.5 16.1 L15.3 17.3 L14.3 16.3 L15.3 15.3 L14.3 14.3 L12.9 15.3 L13.9 16.3 L12.9 17.3 L11.7 16.1 L9.7 18.1 L8.3 16.7 L10.3 14.7 L9.1 13.5 L10.1 12.5 L11.1 13.5 L12.1 12.5 L6.1 6.5 L6.1 4.5 Z'

export const ICON_CROSSED_SWORDS = svgToDataUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
    `<path d="${SWORDS_PATH}" fill="#fff" stroke="#111" stroke-width="1.2" stroke-linejoin="round"/>` +
  '</svg>'
);

// Variante centralizada para botões do mapa (compensa massa visual deslocada à direita/cima)
export const ICON_CROSSED_SWORDS_CENTERED = svgToDataUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
    `<g transform="translate(-2.1 0.7)">
      <path d="${SWORDS_PATH}" fill="#fff" stroke="#111" stroke-width="1.2" stroke-linejoin="round"/>
    </g>` +
  '</svg>'
);

// Variante apenas para mapa: mesmo centramento, porém com escala interna um pouco maior.
export const ICON_CROSSED_SWORDS_MAP = svgToDataUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
    `<g transform="translate(-2.7 0.7) scale(1.1)">
      <path d="${SWORDS_PATH}" fill="#fff" stroke="#111" stroke-width="1.2" stroke-linejoin="round"/>
    </g>` +
  '</svg>'
);

export const createBtnCrossedSwords = (el, {
  size = 24,
  className = 'go-btn-cal',
  title = 'Enviar comandos',
  onClick,
  iconUri = ICON_CROSSED_SWORDS
} = {}) => {
  const btn = document.createElement('button');
  const iconClass = iconClassFor(size);
  const inlineSize = iconClass ? '' : `style="width:${size}px;height:${size}px;"`
  btn.innerHTML = `<img src="${iconUri}" class="${iconClass}" ${inlineSize} />`;
  btn.setAttribute('title', title);
  btn.setAttribute('class', className)
  if (typeof onClick === 'function') {
    btn.addEventListener('click', onClick);
  }
  el.insertAdjacentElement('beforeend', btn);
  return btn;
}
