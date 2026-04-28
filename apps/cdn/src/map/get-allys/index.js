export async function getAllys() {
  return await fetch('/map/ally.txt')
  .then(response => response.text())
  .then(text => text.split('\n')
    .map(e => e.split(','))
    .reduce((arr, e) => {
      if (e.length) {
        const [id, name, tag, members, villages, points, all_points, rank] = e

        arr.push({
          id: Number(id),
          name: decodeURIComponent(String(name)).replaceAll('+', ' '),
          tag: decodeURIComponent(String(tag)).replaceAll('+', ' '),
          members: Number(members),
          villages: Number(villages),
          points: Number(points),
          all_points: Number(all_points),
          rank: Number(rank),
        })
      }

      return arr
    }, []).sort((a, b) => a.rank > b.rank ? 1 : a.rank < b.rank ? -1 : 0)
  )
}
