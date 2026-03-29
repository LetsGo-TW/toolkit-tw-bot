import { decodeTwText, getWorldUrl, parseLastModified } from '../helpers';

export const parsePlayers = (text) =>
  text
    .split('\n')
    .map((entry) => entry.split(','))
    .reduce((players, entry) => {
      if (!entry.length) return players;

      const [playerId, name, tribeId, villages, points, rank] = entry;

      if (playerId && playerId !== '0') {
        players.push({
          id: Number(playerId),
          name: decodeTwText(name),
          allyId: Number(tribeId) ? Number(tribeId) : 0,
          villages: Number(villages),
          points: Number(points),
          rank: Number(rank),
        });
      }

      return players;
    }, [])
    .sort((a, b) => (a.rank > b.rank ? 1 : a.rank < b.rank ? -1 : 0));

export const fetchTwPlayersApi = async (world) => {
  const response = await fetch(getWorldUrl(world, '/map/player.txt'), {
    cache: 'no-store',
  });
  const rawText = await response.text();

  return {
    lastModified: parseLastModified(response.headers),
    players: parsePlayers(rawText),
    rawText,
  };
};
