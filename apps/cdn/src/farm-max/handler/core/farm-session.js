// ./core/farm-session.js
import { storageFarmSession } from "../../config";
import { dataConfig } from "../../config/data";

const nowSecs = () => Math.floor(Date.now() / 1000);

export async function getFarmSession() {
  try { return (await storageFarmSession.get()) || null; } catch { return null; }
}

export async function clearFarmSession() {
  try { await storageFarmSession.set(null); } catch { /* intentionally empty */ }
}

export async function ensureFarmSession(villageId) {
  const { config } = await dataConfig();
  const TIME_TO_AVOID_REPEATING_THE_ATTACK = Number(config.timeNoRepeat || 10); // minutes
  const limitSeconds = TIME_TO_AVOID_REPEATING_THE_ATTACK * 60;
  const cur = await getFarmSession();
  const now = nowSecs();

  const mustReset =
    !cur ||
    Number(cur.villageId) !== Number(villageId) ||
    ((Number(cur.time) || 0) + limitSeconds) <= now;

  if (mustReset) {
    const fresh = { villageId: Number(villageId), time: now, targets: [] };
    await storageFarmSession.set(fresh);
    return fresh;
  }

  return cur;
}

export async function addTargetToSession(villageId, targetId) {
  if (targetId == null) return;
  const tid = Number(targetId);
  if (!Number.isFinite(tid)) return;

  const sess = await ensureFarmSession(villageId);
  // garanta que targets é um array de números
  if (!Array.isArray(sess.targets)) sess.targets = [];
  if (!sess.targets.includes(tid)) {
    sess.targets.push(tid);
    sess.time = nowSecs(); // janela deslizante
    await storageFarmSession.set(sess);
  }
}

export async function hasTargetInSession(villageId, targetId) {
  const tid = Number(targetId);
  if (!Number.isFinite(tid)) return false;
  const sess = await ensureFarmSession(villageId);
  return Array.isArray(sess.targets) && sess.targets.includes(tid);
}

// opcional: para rollback em erro de POST/captcha
export async function removeTargetFromSession(villageId, targetId) {
  const tid = Number(targetId);
  if (!Number.isFinite(tid)) return;
  const sess = await ensureFarmSession(villageId);
  if (!Array.isArray(sess.targets)) return;
  const i = sess.targets.indexOf(tid);
  if (i >= 0) {
    sess.targets.splice(i, 1);
    await storageFarmSession.set(sess);
  }
}
