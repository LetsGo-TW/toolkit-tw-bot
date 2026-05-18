(async () => {
  const DB_NAME = "toolkit_table_production";
  const STORE_NAME = "keyval";

  const openDb = () =>
    new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });

  const getKey = (db, key) =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });

  const db = await openDb();
  const entriesDoc = await getKey(db, "table-production:entries");
  const nextUpdateDoc = await getKey(db, "table-production:next-update");

  const world = String(window.game_data?.world || "").trim();
  const playerId = Number(window.game_data?.player?.id || 0);
  const premium = true;   // false se quiser cache non-premium
  const groupId = 0;      // troque para o groupId desejado

  const mode = premium ? "p" : "np";
  const cacheKey = `${world}:${playerId}:${mode}:${groupId}`;

  const entry = entriesDoc?.entries?.[cacheKey] || null;
  const values = entry?.values || [];
  const nextAt = nextUpdateDoc?.[cacheKey] || null;

  console.log("cacheKey:", cacheKey);
  console.log("entry:", entry);
  console.log("values:", values);
  console.log("nextAt:", nextAt ? new Date(nextAt).toLocaleString("pt-BR") : null);

  window.__tableProductionCache__ = values;
  return values;
})();
