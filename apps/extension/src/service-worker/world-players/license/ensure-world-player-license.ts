import { ensureWorldPlayersLoaded, getWorldPlayer, setWorldPlayerLicense } from '..'
import {
  canPostLicense,
  createActiveLicensePostState,
  createLicensePostCooldownState,
  getDelayInMinutes,
  resolveRuntimeLicense,
  type EnsureWorldPlayerLicenseSource,
} from '.'
import { scheduleLicenseAlarm } from './alarm'
import { AuthRequestError, issueTokenByPost } from './issue'

type EnsureWorldPlayerLicenseResult = {
  attemptedPost: boolean
  blockedByCooldown: boolean
  worldPlayer: ReturnType<typeof getWorldPlayer>
}

const pendingEnsureWorldPlayerLicenseByKey = new Map<string, Promise<EnsureWorldPlayerLicenseResult | null>>()

function getLicenseFailureStatus(error: unknown) {
  return error instanceof AuthRequestError
    ? error.status
    : 0
}

export async function ensureWorldPlayerLicense(
  world: string,
  playerId: number,
  source: EnsureWorldPlayerLicenseSource,
) {
  const key = `${world}:${playerId}`
  const pending = pendingEnsureWorldPlayerLicenseByKey.get(key)

  if (pending) {
    return await pending
  }

  const task = (async () => {
    await ensureWorldPlayersLoaded()

    const worldPlayer = getWorldPlayer(world, playerId)

    if (!worldPlayer) {
      return null
    }

    const runtimeLicense = resolveRuntimeLicense(worldPlayer.license)

    if (runtimeLicense.isAllowedByLicense) {
      if (worldPlayer.license.token) {
        await scheduleLicenseAlarm(world, playerId, runtimeLicense.delayInMinutes)
      }

      return {
        attemptedPost: false,
        blockedByCooldown: false,
        worldPlayer,
      }
    }

    if (!canPostLicense(worldPlayer.license, source)) {
      return {
        attemptedPost: false,
        blockedByCooldown: true,
        worldPlayer,
      }
    }

    try {
      const result = await issueTokenByPost(world, playerId)
      const nextWorldPlayer = await setWorldPlayerLicense({
        world,
        playerId,
        licenseId: result.player?._id ?? null,
        token: result.token,
        ...createActiveLicensePostState(),
      })

      if (nextWorldPlayer?.license.token) {
        await scheduleLicenseAlarm(world, playerId, getDelayInMinutes(nextWorldPlayer.license))
      }

      return {
        attemptedPost: true,
        blockedByCooldown: false,
        worldPlayer: nextWorldPlayer,
      }
    } catch (error) {
      const shouldClearToken = (
        error instanceof AuthRequestError
        && (error.status === 401 || error.status === 403)
      )
      const nextWorldPlayer = await setWorldPlayerLicense({
        world,
        playerId,
        ...(shouldClearToken
          ? {
            licenseId: null,
            token: null,
          }
          : {}),
        ...createLicensePostCooldownState(getLicenseFailureStatus(error)),
      })

      return {
        attemptedPost: true,
        blockedByCooldown: false,
        worldPlayer: nextWorldPlayer ?? worldPlayer,
      }
    }
  })()

  pendingEnsureWorldPlayerLicenseByKey.set(key, task)

  try {
    return await task
  } finally {
    pendingEnsureWorldPlayerLicenseByKey.delete(key)
  }
}
