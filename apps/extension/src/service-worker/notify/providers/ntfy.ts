export async function sendNtfyMessage({
  message,
  topic,
}: {
  message: string
  topic: string
}) {
  const response = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
    body: message,
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error(`ntfy returned HTTP ${response.status}`)
  }

  return {
    sent: true,
  }
}
