import orderCoordsFromCoords from './orderCoordsFromCoords.js'

export function orderTragetsFromSenders(senders = [], targets = []) {
  return orderCoordsFromCoords(targets, senders)
}

export default orderTragetsFromSenders
