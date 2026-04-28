function eventPayload({ stats = {}, validation = {}, meta = {} } = {}) {
  return {
    ...stats,
    validation: { ...validation },
    meta: { ...meta }
  }
}

function createEventPayloadFactory({ source = 'app', eventVersion = 1 } = {}) {
  let seq = 0

  const next = ({ stats = {}, validation = {}, meta = {} } = {}) => {
    seq += 1
    return eventPayload({
      stats,
      validation,
      meta: {
        source,
        eventVersion,
        seq,
        emittedAt: Date.now(),
        ...meta
      }
    })
  }

  const reset = () => {
    seq = 0
  }

  const getSeq = () => seq

  return {
    next,
    reset,
    getSeq
  }
}

export { eventPayload, createEventPayloadFactory }
export default eventPayload
