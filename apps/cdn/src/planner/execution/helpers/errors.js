export function parseExecutionError(error, detector) {
  const errorMsg = String(error?.message || error || 'Erro desconhecido')
  const captchaDetected = typeof detector === 'function'
    ? Boolean(detector(error))
    : false
  return {
    errorMsg,
    captchaDetected
  }
}

export function markCaptchaInterruption(view) {
  const interruptedMessage = 'Captcha detectado. Execução interrompida.'
  view?.feedUpsert?.({
    id: '__exec:captcha__',
    status: 'error',
    title: 'Execução interrompida',
    detail: interruptedMessage
  })
  return interruptedMessage
}
