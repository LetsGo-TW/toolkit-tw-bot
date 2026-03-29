const yieldThread = () => new Promise((resolve) => setTimeout(resolve, 0));

export async function bulkUpsertInBatches(db, docs, batchSize = 5000) {
  if (!Array.isArray(docs) || !docs.length) return [];

  const results = [];
  for (let index = 0; index < docs.length; index += batchSize) {
    const batch = docs.slice(index, index + batchSize);
    await yieldThread();
    const response = await db.bulkUpsert(batch);
    results.push(response);
  }

  return results;
}
