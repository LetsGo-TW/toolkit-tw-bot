import { getWorldPlayerCtxTarget } from '../../prepared-context/get-targets'
import { ensureWorldPlayersLoaded, getWorldPlayer, setWorldPlayerLicense, type WorldPlayerRecord } from '..'
import { createActiveLicensePostState, createLicensePostCooldownState, getDelayInMinutes, isExpired } from '.'
import { AuthRequestError, issueTokenByPost, refreshTokenByGet } from './issue'

type ScheduleLicenseAlarm = (
  world: string,
  playerId: number,
  delayInMinutes: number,
) => Promise<void>

type RefreshTokenOptions = {
  requireCtxTarget?: boolean
  schedule?: ScheduleLicenseAlarm
}

type RefreshTokenResult = {
  delayInMinutes: number
  token: string | null
  used: 'get' | 'post'
  worldPlayer: WorldPlayerRecord
}

const pendingRefreshTokenByKey = new Map<string, Promise<RefreshTokenResult | null>>()

function getLicenseFailureStatus(error: unknown) {
  return error instanceof AuthRequestError
    ? error.status
    : 0
}

export async function refreshToken(
  world: string,
  playerId: number,
  options: RefreshTokenOptions = {},
) {
  const key = `${world}:${playerId}`
  const pending = pendingRefreshTokenByKey.get(key)

  if (pending) {
    return await pending
  }

  const task: Promise<RefreshTokenResult | null> = (async (): Promise<RefreshTokenResult | null> => {
    if (options.requireCtxTarget) {
      const target = await getWorldPlayerCtxTarget(world, playerId)

      if (!target) {
        return null
      }
    }

    await ensureWorldPlayersLoaded()

    const worldPlayer = getWorldPlayer(world, playerId)

    if (!worldPlayer) {
      return null
    }

    let nextToken: string | null = null
    let nextLicenseId = worldPlayer.license.id
    let used: 'get' | 'post' = 'post'

    if (worldPlayer.license.token && !isExpired(worldPlayer.license)) {
      try {
        used = 'get'
        const result = await refreshTokenByGet(worldPlayer.license.token)
        nextToken = result.token
      } catch (error) {
        if (error instanceof AuthRequestError && error.status === 403) {
          const nextWorldPlayer = await setWorldPlayerLicense({
            world,
            playerId,
            licenseId: null,
            token: null,
            ...createLicensePostCooldownState(error.status),
          })

          return nextWorldPlayer
            ? {
              delayInMinutes: 0,
              token: null,
              used,
              worldPlayer: nextWorldPlayer,
            }
            : null
        }

        if (
          !(error instanceof AuthRequestError)
          || (error.status !== 401 && error.status !== 406)
        ) {
          const nextWorldPlayer = await setWorldPlayerLicense({
            world,
            playerId,
            ...createLicensePostCooldownState(getLicenseFailureStatus(error)),
          })

          return nextWorldPlayer
            ? {
              delayInMinutes: 0,
              token: null,
              used,
              worldPlayer: nextWorldPlayer,
            }
            : null
        }
      }
    }

    if (!nextToken) {
      try {
        const result = await issueTokenByPost(world, playerId)
        nextToken = result.token
        nextLicenseId = result.player?._id ?? nextLicenseId
        used = 'post'
      } catch (error) {
        if (
          error instanceof AuthRequestError
          && (error.status === 401 || error.status === 403)
        ) {
          const nextWorldPlayer = await setWorldPlayerLicense({
            world,
            playerId,
            licenseId: null,
            token: null,
            ...createLicensePostCooldownState(error.status),
          })

          return nextWorldPlayer
            ? {
              delayInMinutes: 0,
              token: null,
              used: 'post',
              worldPlayer: nextWorldPlayer,
            }
            : null
        }

        const nextWorldPlayer = await setWorldPlayerLicense({
          world,
          playerId,
          ...createLicensePostCooldownState(getLicenseFailureStatus(error)),
        })

        return nextWorldPlayer
          ? {
            delayInMinutes: 0,
            token: null,
            used: 'post',
            worldPlayer: nextWorldPlayer,
          }
          : null
      }
    }

    const nextWorldPlayer = await setWorldPlayerLicense({
      world,
      playerId,
      licenseId: nextLicenseId,
      token: nextToken,
      ...createActiveLicensePostState(),
    })

    if (!nextWorldPlayer?.license.token) {
      return null
    }

    const delayInMinutes = getDelayInMinutes(nextWorldPlayer.license)

    if (options.schedule) {
      await options.schedule(world, playerId, delayInMinutes)
    }

    return {
      delayInMinutes,
      token: nextWorldPlayer.license.token,
      used,
      worldPlayer: nextWorldPlayer,
    }
  })()

  pendingRefreshTokenByKey.set(key, task)

  try {
    return await task
  } finally {
    pendingRefreshTokenByKey.delete(key)
  }
}
