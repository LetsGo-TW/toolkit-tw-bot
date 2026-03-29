export const decodeTwText = (value) =>
  decodeURIComponent(String(value).replace(/\+/g, '%20'));

export const parseLastModified = (headers) => {
  const lastModifiedHeader = headers?.get?.('last-modified');
  const parsed = lastModifiedHeader ? Date.parse(lastModifiedHeader) : NaN;
  return Number.isFinite(parsed) ? parsed : Date.now();
};

export const getWorldOrigin = (world) => {
  const { protocol, hostname } = window.location;
  const parts = hostname.split('.');

  if (parts.length > 2) {
    parts[0] = world;
    return `${protocol}//${parts.join('.')}`;
  }

  return `${protocol}//${world}.${hostname}`;
};

export const getWorldUrl = (world, pathname) =>
  new URL(pathname, getWorldOrigin(world)).toString();
