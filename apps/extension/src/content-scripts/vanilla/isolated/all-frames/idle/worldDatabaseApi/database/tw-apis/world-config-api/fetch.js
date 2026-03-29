import { getWorldUrl } from '../helpers';

export const parseWorldConfig = (text) => {
  const xml = new DOMParser().parseFromString(text, 'text/xml');

  return Array.from(xml.querySelectorAll('config'))
    .map((entry) => Array.from(entry.children))[0]
    .reduce((config, entry) => {
      config[entry.nodeName] = !entry.children.length
        ? Number.isNaN(Number(entry.innerHTML))
          ? entry.innerHTML
          : Number(entry.innerHTML)
        : Array.from(entry.children).reduce((nested, child) => {
            nested[child.nodeName] = Number.isNaN(Number(child.innerHTML))
              ? child.innerHTML
              : Number(child.innerHTML);

            return nested;
          }, {});

      return config;
    }, {});
};

const fetchTwConfigApi = async (world) => {
  const response = await fetch(getWorldUrl(world, '/interface.php?func=get_config'), {
    cache: 'no-store',
  });
  const rawText = await response.text();

  return {
    worldConfig: parseWorldConfig(rawText),
    rawText,
  };
};

export default fetchTwConfigApi;
