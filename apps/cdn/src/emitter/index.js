class Emitters {
  constructor() {
    this.events = {}
  }

  on(event, cb) {
    this.events[event] = this.events[event] || []
    this.events[event].push(cb)
  }

  remove(event) {
    if (event in this.events === false) return
    delete this.events[event]
  }

  emit(event, ...rest) {
    if (event in this.events === false) return
    this.events[event].forEach( e => e(...rest) )
  }
}

export default Emitters
