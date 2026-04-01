function socketListen(fn) {
  fn = fn || console.warn;

  let property = Object.getOwnPropertyDescriptor(MessageEvent.prototype, "data");

  const data = property.get;

  function lookAtMessage() {
    let socket = this.currentTarget instanceof WebSocket;

    if (!socket) {
      return data.call(this);
    }

    let msg = data.call(this);

    Object.defineProperty(this, "data", { value: msg } ); //anti-loop
    fn({ data: msg, socket:this.currentTarget, event:this });
    return msg;
  }

  property.get = lookAtMessage;

  Object.defineProperty(MessageEvent.prototype, "data", property);
}

export { socketListen }
