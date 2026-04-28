import { printMessage } from "../../components/printMessage"

export async function getVillages() {
  return await fetch('/map/village.txt')
  .then(response => response.text())
  .then(text => text.split('\n')
    .map(e => e.split(','))
    .reduce((arr, e) => {
      if (e.length) {
        const [village_id, name, x, y, player_id, points, rank] = e

        if (village_id) {
          arr.push({
            village_id: Number(village_id),
            name: decodeURIComponent(String(name)).replaceAll('+', ' '),
            x: Number(x),
            y: Number(y),
            player_id: Number(player_id) ? Number(player_id) : 0,
            points: Number(points),
            rank: Number(rank),
          })
        }
      }

      return arr
    }, []).sort(
      (a, b) => a.rank > b.rank ? 1 : a.rank < b.rank ? -1 : 0
    )
  )
}

export function printPullCoinsReport() {
  const reports = JSON.parse(localStorage['GO-Report-8092491'])

  if (!reports) printMessage.error('No Reports', 5000)

  const resume = reports.filter(
    e => e.type === 'Pull-Coins' && new Date(e.date).getDay() === new Date().getDay()
  ).sort().reduce((resume, e) => {
    const { wood, stone, iron, village } = { ...e.success[0] }

    const { x, y, name, player_name } = {...village}

    const village_name = `${name} (${x}|${y}) K${String(y).split('')[0]}${String(x).split('')[0]}`

    resume.wood += wood,
    resume.stone += stone,
    resume.iron += iron,
    resume.village_name = village_name,
    resume.player_name = player_name

    return resume
  }, {
    wood: 0,
    stone: 0,
    iron: 0,
    village_name: '',
    player_name: ''
  })
  printMessage.success(`${
    resume.player_name
  } - ${
    resume.village_name
  } <br>
    <span class="icon header wood"></span> ${
      resume.wood.toString().replace(/(\d)(?=(\d\d\d)+(?!\d))/g, '$1.')
    } - <span class="icon header stone"></span> ${
      resume.stone.toString().replace(/(\d)(?=(\d\d\d)+(?!\d))/g, '$1.')
    } - <span class="icon header iron"></span> ${
      resume.iron.toString().replace(/(\d)(?=(\d\d\d)+(?!\d))/g, '$1.')
    }`, 10000)
}
