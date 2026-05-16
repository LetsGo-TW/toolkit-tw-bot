import { storageBreakWallBlacklist } from "./index";
import { removeReviewedRedTarget } from "./reviewed-red-targets.js";

async function getBlacklist() {
  const blacklist = await storageBreakWallBlacklist.get() || [];
  return blacklist;
}

async function saveBlacklist(blacklist) {
  await storageBreakWallBlacklist.set(blacklist);
}

async function upsertToBlacklist(targetId, reportId, x, y) {
  const blacklist = await getBlacklist();
  const numTargetId = Number(targetId);
  const index = blacklist.findIndex(item => item.target === numTargetId);
  const nextEntry = {
    target: numTargetId,
    report_id: Number(reportId),
  };

  if (x != null) nextEntry.x = Number(x);
  if (y != null) nextEntry.y = Number(y);

  if (index > -1) {
    blacklist[index] = { ...blacklist[index], ...nextEntry };
  } else {
    blacklist.push(nextEntry);
  }
  await saveBlacklist(blacklist);
  await removeReviewedRedTarget(numTargetId);
}

async function removeFromBlacklist(targetId) {
  let blacklist = await getBlacklist();
  const numTargetId = Number(targetId);
  const initialLength = blacklist.length;
  blacklist = blacklist.filter(item => item.target !== numTargetId);
  if (blacklist.length < initialLength) {
    await saveBlacklist(blacklist);
  }
}

export {
  getBlacklist, saveBlacklist, upsertToBlacklist, removeFromBlacklist
};
