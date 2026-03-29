import PouchDB from 'pouchdb-browser';

export class PouchDbBase {
  constructor(name, options = {}) {
    if (!name) throw new Error('PouchDbBase: name is required');
    this.name = name;
    this.db = new PouchDB(name, options);
  }

  info() {
    return this.db.info();
  }

  get(id, opts) {
    return this.db.get(id, opts);
  }

  put(doc, opts = {}) {
    return this.db.put(doc, opts);
  }

  bulkDocs(docs, opts = {}) {
    return this.db.bulkDocs(docs, opts);
  }

  allDocs(opts = {}) {
    return this.db.allDocs(opts);
  }

  close() {
    return this.db.close();
  }

  destroy() {
    return this.db.destroy();
  }
}

export default PouchDbBase;
