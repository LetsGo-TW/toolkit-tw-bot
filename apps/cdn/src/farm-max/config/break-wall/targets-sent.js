import { storageBreakWallTargetsSent } from "./index";
import { removeReviewedRedTarget } from "./reviewed-red-targets.js";
import { dateTimeNow } from "../../../stable-compat/date-tw";

async function getAvaiablesSents() {
  const sents = await storageBreakWallTargetsSent.get() || []
  const check = sents.filter(sent => sent.arrival <= dateTimeNow())
  const avaible = sents.filter(sent => sent.arrival > dateTimeNow())
  const all = avaible.length + check.length !== sents.length
    ? sents.filter(({ target }) => {
      const isCheck = () => !!check.find(({ target: t }) => Number(t) === Number(target))
      const isAvaible = () => !!avaible.find(({ target: t }) => Number(t) === Number(target))
      return isCheck() || isAvaible()
    })
    : sents
  return { all, check, avaible }
}

async function getSentByTarget(target) {
  const { all: sents } = await getAvaiablesSents()
  return sents.find(sent => Number(sent.target) === Number(target))
}

/// salva os enviados
async function saveTargetSent(data) {
  const { all: sents } = await getAvaiablesSents()
  const index = sents.findIndex(sent => Number(sent.target) === Number(data.target))
  if (index === -1) {
    sents.push(data)
  } else {
    sents[index] = { ...sents[index], ...data }
  }
  await storageBreakWallTargetsSent.set(sents)
  await removeReviewedRedTarget(data.target)
}

async function removeSentByTarget(target) {
  const { all: sents } = await getAvaiablesSents()
  const index = sents.findIndex(sent => Number(sent.target) === Number(target))
  if (index === -1) return
  sents.splice(index, 1)
  await storageBreakWallTargetsSent.set(sents)
}

async function isSentByTarget(target) {
  const { all, check, avaiable } = await getAvaiablesSents()
  return {
    all: !!all.find(sent => Number(sent.target) === Number(target)),
    check: !!check.find(sent => Number(sent.target) === Number(target)),
    avaiable: !!avaiable.find(sent => Number(sent.target) === Number(target))
  }
}

export { getAvaiablesSents, getSentByTarget, removeSentByTarget, saveTargetSent, isSentByTarget }
