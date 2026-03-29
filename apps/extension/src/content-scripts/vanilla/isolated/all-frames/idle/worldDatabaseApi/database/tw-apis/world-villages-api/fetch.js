import { decodeTwText, getWorldUrl, parseLastModified } from '../helpers';

export const parseVillages = (text) =>
  text
    .split('\n')
    .map((entry) => entry.split(','))
    .reduce((villages, entry) => {
      if (!entry.length) return villages;

      const [villageId, name, x, y, playerId, points, rank] = entry;

      if (villageId) {
        villages.push({
          id: Number(villageId),
          name: decodeTwText(name),
          x: Number(x),
          y: Number(y),
          playerId: Number(playerId) ? Number(playerId) : 0,
          points: Number(points),
          rank: Number(rank),
        });
      }

      return villages;
    }, [])
    .sort((a, b) => (a.rank > b.rank ? 1 : a.rank < b.rank ? -1 : 0));

export const fetchTwVillagesApi = async (world) => {
  const response = await fetch(getWorldUrl(world, '/map/village.txt'), {
    cache: 'no-store',
  });
  const rawText = await response.text();

  return {
    lastModified: parseLastModified(response.headers),
    villages: parseVillages(rawText),
    rawText,
  };
};
