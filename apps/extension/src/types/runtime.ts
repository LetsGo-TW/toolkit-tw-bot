export type RuntimeStatus =
  | 'ready'
  | 'running'
  | 'off'
  | 'net-error'
  | 'connect-error'

export function getRuntimeStatus({
  active = false,
  enabledByUser = null,
  hasPlayerIdentity = false,
  isNetError = false,
  isConnectServerError = false,
}: {
  active?: boolean
  enabledByUser?: boolean | null
  hasPlayerIdentity?: boolean
  isNetError?: boolean
  isConnectServerError?: boolean
}): RuntimeStatus {
  if (hasPlayerIdentity && enabledByUser === false) {
    return 'off'
  }

  if (isNetError) {
    return 'net-error'
  }

  if (isConnectServerError) {
    return 'connect-error'
  }

  if (active) {
    return 'running'
  }

  return 'ready'
}
