export async function getPlayers() {
  return await fetch('/map/player.txt')
  .then(response => response.text())
  .then(text => text.split('\n')
    .map(e => e.split(','))
    .reduce((arr, e) => {
      if (e.length) {
        const [player_id, name, tribe_id, villages, points, rank] = e

        arr.push({
          player_id: Number(player_id),
          name: decodeURIComponent(String(name)).replaceAll('+', ' '),
          tribe_id: Number(tribe_id) ? Number(tribe_id) : null,
          villages: Number(villages),
          points: Number(points),
          rank: Number(rank),
        })
      }

      return arr
    }, []).sort((a, b) => a.rank > b.rank ? 1 : a.rank < b.rank ? -1 : 0)
  )
}
