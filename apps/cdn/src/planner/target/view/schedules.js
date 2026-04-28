import { getGameData } from "@toolkit-tw-bot/document";
import { printMessage } from "../../../components/printMessage";

export function actionSchedulesTargetInit(targetContent, village) {
  if (!targetContent) return;
  const btnScheTarget = targetContent.querySelector("#go-btn-schedule-target")
  let currentVillage = village

  const action = () => {
    insertSchedulesTargetView(currentVillage)
  }
  const onPlannerTargetPreviewChange = (event) => {
    const nextVillage = event?.detail?.village
    if (!nextVillage || typeof nextVillage !== 'object') return
    currentVillage = nextVillage
  }
  btnScheTarget?.addEventListener('click', action)
  targetContent?.addEventListener?.('go:planner:target:preview-change', onPlannerTargetPreviewChange)
}
function insertSchedulesTargetView(village) {
  printMessage.warn('Not implements.', 2000)
}

export function actionSchedulesSenderInit(targetContent, village) {
  if (!targetContent) return;
  const btnScheSender = targetContent.querySelector("#go-btn-schedule-sender")
  const gameData = getGameData();
  let currentVillage = village
  const syncDisabled = () => {
    const ownerId = Number(currentVillage?.owner ?? currentVillage?.playerId)
    if (Number(gameData.player.id) !== ownerId) {
      btnScheSender?.setAttribute('disabled', true)
      return
    }
    btnScheSender?.removeAttribute('disabled')
  }
  syncDisabled()
  const action = () => {
    insertSchedulesSenderView(currentVillage)
  }
  const onPlannerTargetPreviewChange = (event) => {
    const nextVillage = event?.detail?.village
    if (!nextVillage || typeof nextVillage !== 'object') return
    currentVillage = nextVillage
    syncDisabled()
  }
  btnScheSender?.addEventListener('click', action)
  targetContent?.addEventListener?.('go:planner:target:preview-change', onPlannerTargetPreviewChange)
}
function insertSchedulesSenderView(village) {
  printMessage.warn('Not implements.', 2000)
}
