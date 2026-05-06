import { getGameData } from "@toolkit-tw-bot/document";

function isVillageCommand(villageId, w = window) {
  const gameData = typeof getGameData !== 'undefined' ? getGameData() : w.game_data
  const players = JSON.parse(localStorage.getItem('players'))
  if (!players || !gameData) return
  const schedules = players[gameData.player.id].schedules
  const command = Object.values(schedules)
    .find(({ mode, villageID }) => mode === 'command' && Number(villageID) === Number(villageId) )
  return !!command
}

export { isVillageCommand }
