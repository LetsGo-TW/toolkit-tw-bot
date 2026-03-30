import { PouchDbBase } from '../pouchDbBase';

class LocalDb extends PouchDbBase {
  async bulkUpsert(docs) {
    if (!Array.isArray(docs) || !docs.length) return [];

    const keys = docs.map((doc) => doc._id).filter(Boolean);
    const existing = await this.allDocs({ keys });
    const revById = new Map(
      existing.rows
        .filter((row) => row && row.value && row.value.rev)
        .map((row) => [row.key, row.value.rev])
    );

    const next = docs.map((doc) => {
      const rev = revById.get(doc._id);
      return rev ? { ...doc, _rev: rev } : doc;
    });

    return await this.bulkDocs(next);
  }

  async findById(id) {
    if (!id) return null;

    try {
      const doc = await this.get(id);
      return { ...doc, id: doc.id ?? doc._id };
    } catch (error) {
      if (error && error.status === 404) return null;
      throw error;
    }
  }

  async update(data) {
    if (!data || !data.id) {
      throw new Error('LocalDb.update: data.id is required');
    }

    try {
      const existing = await this.get(data.id);
      const next = { ...existing, ...data, _id: data.id, _rev: existing._rev };
      return await this.put(next);
    } catch (error) {
      if (error && error.status === 404) {
        const next = { ...data, _id: data.id };
        return await this.put(next);
      }
      throw error;
    }
  }
}

export const worldVillagesDatalocal = new LocalDb('tw-world-villages');
export const worldAllPlayersDatalocal = new LocalDb('tw-world-players');
export const worldAllysDatalocal = new LocalDb('tw-world-allys');
export const worldConfigDatalocal = new LocalDb('tw-world-config');
export { LocalDb };
