const API_ORIGIN = process.env.EXTENSION_API_ORIGIN
const AUTH_URL = `${API_ORIGIN}/auth`

export class AuthRequestError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'AuthRequestError'
    this.status = status
  }
}

export type IssueTokenResponse = {
  player: {
    _id: string
    world: string
    player_id: number
    due: string
  }
  token: string
}

export type RefreshTokenResponse = {
  token: string
}

export async function issueTokenByPost(world: string, playerId: number) {
  const response = await fetch(AUTH_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      player_id: playerId,
      world,
    }),
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null)
    throw new AuthRequestError(
      response.status,
      `[auth:post] ${response.status} ${errorBody?.message || errorBody?.error || 'Token issue failed'}`,
    )
  }

  return await response.json() as IssueTokenResponse
}

export async function refreshTokenByGet(token: string) {
  const response = await fetch(AUTH_URL, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null)
    throw new AuthRequestError(
      response.status,
      `[auth:get] ${response.status} ${errorBody?.message || errorBody?.error || 'Token refresh failed'}`,
    )
  }

  return await response.json() as RefreshTokenResponse
}
