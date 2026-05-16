import { storageBreakWallRedReviewed } from "./index";
import { dateTimeNow } from "../../../stable-compat/date-tw";

const REVIEWED_RED_TARGET_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function normalizeReviewedRedTargets(entries = []) {
  const byTarget = new Map();

  for (const entry of entries) {
    const target = Number(entry?.target);
    const report_id = Number(entry?.report_id);
    const checkedAt = Number(entry?.checkedAt);

    if (!Number.isFinite(target) || target <= 0) continue;
    if (!Number.isFinite(report_id) || report_id <= 0) continue;
    if (!Number.isFinite(checkedAt) || checkedAt <= 0) continue;

    const normalized = {
      target,
      report_id,
      checkedAt,
      result: entry?.result === 'blacklisted' ? 'blacklisted' : 'ignored',
    };

    const previous = byTarget.get(target);
    if (!previous || normalized.checkedAt >= previous.checkedAt) {
      byTarget.set(target, normalized);
    }
  }

  return Array.from(byTarget.values());
}

function pruneReviewedRedTargets(entries = [], now = dateTimeNow()) {
  const minCheckedAt = now - REVIEWED_RED_TARGET_TTL_MS;

  return normalizeReviewedRedTargets(entries)
    .filter((entry) => entry.checkedAt >= minCheckedAt);
}

async function getReviewedRedTargets() {
  const stored = await storageBreakWallRedReviewed.get() || [];
  const pruned = pruneReviewedRedTargets(stored);

  if (pruned.length !== normalizeReviewedRedTargets(stored).length) {
    await storageBreakWallRedReviewed.set(pruned);
  }

  return pruned;
}

async function saveReviewedRedTargets(entries = []) {
  const nextEntries = pruneReviewedRedTargets(entries);
  await storageBreakWallRedReviewed.set(nextEntries);
  return nextEntries;
}

async function getReviewedRedTarget(target) {
  const reviewedTargets = await getReviewedRedTargets();
  return reviewedTargets.find((entry) => Number(entry.target) === Number(target)) || null;
}

async function upsertReviewedRedTarget({
  target,
  report_id,
  checkedAt = dateTimeNow(),
  result = 'ignored',
} = {}) {
  const reviewedTargets = await getReviewedRedTargets();
  const numTarget = Number(target);
  const index = reviewedTargets.findIndex((entry) => Number(entry.target) === numTarget);
  const nextEntry = {
    target: numTarget,
    report_id: Number(report_id),
    checkedAt: Number(checkedAt),
    result: result === 'blacklisted' ? 'blacklisted' : 'ignored',
  };

  if (index === -1) {
    reviewedTargets.push(nextEntry);
  } else {
    reviewedTargets[index] = {
      ...reviewedTargets[index],
      ...nextEntry,
    };
  }

  return await saveReviewedRedTargets(reviewedTargets);
}

async function removeReviewedRedTarget(target) {
  const reviewedTargets = await getReviewedRedTargets();
  const numTarget = Number(target);
  const nextEntries = reviewedTargets.filter((entry) => Number(entry.target) !== numTarget);

  if (nextEntries.length === reviewedTargets.length) {
    return reviewedTargets;
  }

  return await saveReviewedRedTargets(nextEntries);
}

export {
  REVIEWED_RED_TARGET_TTL_MS,
  getReviewedRedTarget,
  getReviewedRedTargets,
  normalizeReviewedRedTargets,
  pruneReviewedRedTargets,
  removeReviewedRedTarget,
  saveReviewedRedTargets,
  upsertReviewedRedTarget,
};
