import Service from "./service"

const service = Service.create()

postMessage({ eventType: 'alive' })

onmessage = async({ data }) => {
  const { type } = data

  service.process[type]({
    ...data,
    type,
    onOcurrenceUpdate: (args) => {
      postMessage({ eventType: 'ocurrenceUpdate', ...args, type })
    },
    onFinishedProcess: () => {
      postMessage({ eventType: 'finishedProcess', type })
    },
    onStopedProcess: (args) => {
      postMessage({ eventType: 'terminate', ...args, type })
    }
  })
}
