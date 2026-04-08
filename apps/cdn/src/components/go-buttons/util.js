export function svgToDataUri(svg) {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
export const iconClassFor = (size) => {
  if (size === 16 || size === 24 || size === 32) return `go-icon-${size}`;
  return '';
}
