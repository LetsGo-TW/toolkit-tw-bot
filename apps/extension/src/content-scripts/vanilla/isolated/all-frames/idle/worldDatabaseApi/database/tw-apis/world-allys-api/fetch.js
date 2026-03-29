import { decodeTwText, getWorldUrl, parseLastModified } from '../helpers';

export const parseAllys = (text) =>
  text
    .split('\n')
    .map((entry) => entry.split(','))
    .reduce((allys, entry) => {
      if (!entry.length) return allys;

      const [id, name, tag, members, villages, points, allPoints, rank] = entry;

      if (id !== '0') {
        allys.push({
          id: Number(id),
          name: decodeTwText(name),
          tag: decodeTwText(tag),
          members: Number(members),
          villages: Number(villages),
          points: Number(points),
          all_points: Number(allPoints),
          rank: Number(rank),
        });
      }

      return allys;
    }, [])
    .sort((a, b) => (a.rank > b.rank ? 1 : a.rank < b.rank ? -1 : 0));

export const fetchTwAllysApi = async (world) => {
  const response = await fetch(getWorldUrl(world, '/map/ally.txt'), {
    cache: 'no-store',
  });
  const rawText = await response.text();

  return {
    lastModified: parseLastModified(response.headers),
    allys: parseAllys(rawText),
    rawText,
  };
};
