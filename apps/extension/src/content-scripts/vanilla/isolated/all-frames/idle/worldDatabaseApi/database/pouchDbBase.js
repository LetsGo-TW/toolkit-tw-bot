import PouchDBModule from 'pouchdb-browser'

const PouchDB = PouchDBModule.default || PouchDBModule

export class PouchDbBase {
  constructor(name, options = {}) {
    if (!name) throw new Error('PouchDbBase: name is required')
    this.name = name
    this.options = options
    this.dbPromise = null
  }

  async getDb() {
    if (!this.dbPromise) {
      this.dbPromise = Promise.resolve(
        new PouchDB(this.name, this.options),
      )
    }

    return await this.dbPromise
  }

  async info() {
    const db = await this.getDb()
    return await db.info()
  }

  async get(id, opts) {
    const db = await this.getDb()
    return await db.get(id, opts)
  }

  async put(doc, opts = {}) {
    const db = await this.getDb()
    return await db.put(doc, opts)
  }

  async bulkDocs(docs, opts = {}) {
    const db = await this.getDb()
    return await db.bulkDocs(docs, opts)
  }

  async allDocs(opts = {}) {
    const db = await this.getDb()
    return await db.allDocs(opts)
  }

  async remove(doc, opts = {}) {
    const db = await this.getDb()
    return await db.remove(doc, opts)
  }

  async close() {
    const db = await this.getDb()
    return await db.close()
  }

  async destroy() {
    const db = await this.getDb()
    return await db.destroy()
  }
}

export default PouchDbBase
