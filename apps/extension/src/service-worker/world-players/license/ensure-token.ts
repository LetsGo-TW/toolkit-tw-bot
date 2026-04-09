import { ensureWorldPlayersLoaded, getWorldPlayer } from '..'
import { resolveRuntimeLicense } from '.'
import { scheduleLicenseAlarm } from './alarm'
import { refreshToken } from './refresh-token'

const pendingEnsureTokenByKey = new Map<string, Promise<string | null>>()

async function ensureToken(world: string, playerId: number) {
  const key = `${world}:${playerId}`
  const pending = pendingEnsureTokenByKey.get(key)

  if (pending) {
    return await pending
  }

  const task = (async () => {
    await ensureWorldPlayersLoaded()
    const worldPlayer = getWorldPlayer(world, playerId)

    if (!worldPlayer?.license?.token) {
      const refreshed = await refreshToken(world, playerId, {
        schedule: scheduleLicenseAlarm,
      })

      return refreshed?.token ?? null
    }

    const runtimeLicense = resolveRuntimeLicense(worldPlayer.license)

    if (!runtimeLicense.isAllowedByLicense || runtimeLicense.isExpired) {
      const refreshed = await refreshToken(world, playerId, {
        schedule: scheduleLicenseAlarm,
      })

      return refreshed?.token ?? null
    }

    return worldPlayer.license.token
  })()

  pendingEnsureTokenByKey.set(key, task)

  try {
    return await task
  } finally {
    pendingEnsureTokenByKey.delete(key)
  }
}

export { ensureToken }
