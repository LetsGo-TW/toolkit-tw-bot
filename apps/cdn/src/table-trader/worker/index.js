import Service from "./service"

const serializeError = (error) => ({
  name: error?.name || "Error",
  message: error?.message || "table-trader worker failed",
  stack: error?.stack || ""
})

const service = Service.create()

postMessage({ eventType: "alive" })

onmessage = async ({ data }) => {
  const { requestId, type } = data || {}
  const handler = service.process[type]

  if (typeof handler !== "function") {
    postMessage({
      eventType: "error",
      requestId,
      type,
      error: serializeError(new Error(`Unknown table-trader worker process: ${type}`))
    })
    return
  }

  try {
    await handler({
      ...data,
      requestId,
      type,
      onOcurrenceUpdate: (args = {}) => {
        postMessage({ eventType: "ocurrenceUpdate", requestId, type, ...args })
      },
      onFinishedProcess: (args = {}) => {
        postMessage({ eventType: "finishedProcess", requestId, type, ...args })
      },
      onStopedProcess: (args = {}) => {
        postMessage({
          eventType: "terminate",
          requestId: args?.requestId || requestId,
          type,
          ...args
        })
      }
    })
  } catch (error) {
    postMessage({
      eventType: "error",
      requestId,
      type,
      error: serializeError(error)
    })
  }
}
