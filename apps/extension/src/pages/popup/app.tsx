import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react'
import styled from 'styled-components'
import Tooltip from '@toolkit-tw-bot/browser/tooltip'
import { SUPPORT_SYNC_PLAYER_AVATAR_MESSAGE_TYPE } from '../../content-scripts/vanilla/isolated/top/idle/support/message-types'
import type { ExtensionLicenseState, FeaturesMap, LicenseStatus } from '../../types'
import userUrl from '../../img/user.png'
import LogoLink from '../components/logo'
import Loading from '../components/loading'
import { PlayerEnabledByUserSwitch } from '../components/player-enabled-by-user-switch'

const POPUP_STATE_MESSAGE_TYPE = 'GET_POPUP_STATE'
const SET_ENABLED_BY_USER_MESSAGE_TYPE = 'SET_ENABLED_BY_USER'
const RUNNER_STORAGE_KEY = 'runnerByScope'
const TAB_CONTEXT_STORAGE_KEY = 'tabContextByTabId'
const WINDOW_LOCK_STORAGE_KEY = 'windowLock'
const WORLD_PLAYERS_STORAGE_KEY = 'worldPlayers'
const PLAYER_AVATAR_BY_SCOPE_KEY_STORAGE_KEY = 'playerAvatarByScopeKey'
const SUPPORT_EMAIL = 'letsgo.tribalwars@gmail.com'
const SUPPORT_EMAIL_HREF = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Let's GO! Support")}`
const PLAYER_AVATAR_TTL_MS = 3 * 60 * 60 * 1000

type PopupState = {
  ok: boolean
  supported: boolean
  reason?: string
  tabId?: number | null
  windowId?: number | null
  title?: string | null
  url?: string | null
  context?: 'GAME' | 'LOGIN' | null
  world?: string | null
  t?: number | null
  playerId?: number | null
  playerName?: string | null
  features?: FeaturesMap | null
  points?: number | null
  rank?: number | null
  villages?: number | null
  dateStarted?: number | null
  avatarUrl?: string | null
  avatarUpdatedAt?: string | null
  enabledByUser?: boolean | null
  isTryConfirm?: boolean
  active?: boolean
  ready?: boolean
  license?: ExtensionLicenseState | null
}

type IconProps = ComponentProps<'svg'>

const Root = styled.main`
  width: 30rem;
  min-height: 0;
  padding: 0.9rem;
  background:
    radial-gradient(circle at top left, ${({ theme }) => theme.successAura}, transparent 36%),
    linear-gradient(180deg, ${({ theme }) => theme.background} 0%, ${({ theme }) => theme.backgroundAccent} 100%);
  color: ${({ theme }) => theme.textPrimary};
`

const Shell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
`

const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.5rem;
`

const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  line-height: 0;
`

const Panel = styled.section`
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding: 0.85rem;
  border-radius: 0.9rem;
  border: 1px solid ${({ theme }) => theme.surfaceBorder};
  background: ${({ theme }) => theme.surface};
  box-shadow: inset 0 1px 0 ${({ theme }) => theme.surfaceInset};
`

const UserCard = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
`

const BotSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
`

const Avatar = styled.img`
  width: 4.4rem;
  height: 4.4rem;
  border-radius: 0.55rem;
  object-fit: cover;
  background: linear-gradient(180deg, ${({ theme }) => theme.avatarGradientStart}, ${({ theme }) => theme.avatarGradientEnd});
`

const UserMeta = styled.div`
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
`

const UserSwitchSlot = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: center;
  flex-shrink: 0;
  padding-top: 0.1rem;
`

const UserLine = styled.strong`
  display: block;
  font-size: 0.92rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const SubLine = styled.span`
  color: ${({ theme }) => theme.textSecondary};
  font-size: 0.74rem;
`

const Pills = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
`

const Pill = styled.span<{ $tone?: 'success' | 'warn' | 'danger' | 'neutral' }>`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  min-height: 1.65rem;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.borderSoft};
  background: ${({ $tone, theme }) => {
    switch ($tone) {
      case 'success':
        return `${theme.success}22`
      case 'warn':
        return `${theme.warn}22`
      case 'danger':
        return `${theme.danger}22`
      default:
        return `${theme.neutral}22`
    }
  }};
  color: ${({ $tone, theme }) => {
    switch ($tone) {
      case 'success':
        return theme.success
      case 'warn':
        return theme.warn
      case 'danger':
        return theme.danger
      default:
        return theme.textPrimary
    }
  }};
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.65rem;
`

const Cell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.65rem 0.7rem;
  border-radius: 0.7rem;
  background: ${({ theme }) => theme.surfaceInner};
`

const Label = styled.span`
  color: ${({ theme }) => theme.textLabel};
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
`

const Value = styled.strong`
  font-size: 0.88rem;
  line-height: 1.2;
  word-break: break-word;
`

const FeatureRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  width: 100%;
`

const FeaturePill = styled(Pill)`
  text-transform: none;
  letter-spacing: 0.03em;
`

const TwSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding-top: 1rem;
`

const TechnicalMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
`

const TechnicalMetaItem = styled.span`
  color: ${({ theme }) => theme.neutral};
  font-size: 0.62rem;
  line-height: 1.3;
  opacity: 0.78;

  strong {
    color: inherit;
    font-weight: 600;
  }
`

const Footer = styled.footer`
  display: flex;
  align-items: center;
  gap: 0.15rem;
  flex-direction: column;
`

const FooterLink = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: ${({ theme }) => theme.success};
  text-decoration: none;
  line-height: 0;
  transition: transform 160ms ease;

  &:hover,
  &:focus-visible {
    transform: scale(1.08);
    outline: none;
  }
`

const FooterMailLink = styled(FooterLink)`
  color: ${({ theme }) => theme.textPrimary};
`

const FooterLinkItens = styled.span`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.6rem;
`

function WhatsappIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M19.05 4.91A9.82 9.82 0 0 0 12.03 2C6.6 2 2.18 6.42 2.18 11.85c0 1.74.45 3.44 1.31 4.95L2 22l5.35-1.4a9.8 9.8 0 0 0 4.68 1.19h.01c5.42 0 9.84-4.42 9.84-9.85a9.77 9.77 0 0 0-2.83-7.03Zm-7.02 15.22h-.01a8.1 8.1 0 0 1-4.13-1.13l-.3-.18-3.18.83.85-3.1-.2-.32a8.12 8.12 0 0 1-1.25-4.38c0-4.47 3.64-8.11 8.12-8.11a8.1 8.1 0 0 1 5.74 2.38 8.07 8.07 0 0 1 2.37 5.75c0 4.47-3.64 8.11-8.11 8.11Zm4.45-6.08c-.24-.12-1.4-.69-1.62-.77-.21-.08-.37-.12-.52.12-.15.23-.6.76-.73.92-.13.15-.26.18-.5.06-.24-.12-1-.37-1.9-1.18-.71-.63-1.18-1.4-1.31-1.64-.14-.24-.01-.37.1-.49.1-.1.24-.26.36-.39.12-.13.15-.23.23-.39.08-.15.04-.29-.02-.41-.06-.12-.52-1.25-.71-1.71-.19-.46-.38-.4-.52-.41h-.44c-.15 0-.39.06-.59.29-.2.23-.77.75-.77 1.83s.79 2.11.9 2.26c.12.15 1.55 2.36 3.75 3.31.52.22.93.36 1.25.46.52.16.99.14 1.37.08.42-.06 1.3-.53 1.48-1.04.19-.5.19-.93.13-1.04-.05-.1-.2-.16-.44-.28Z" />
    </svg>
  )
}

function MailIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 6h16v12H4z" />
      <path d="m4 8 8 5 8-5" />
    </svg>
  )
}

const FooterIcon = styled(WhatsappIcon)`
  width: 1.25rem;
  height: 1.25rem;
`

const FooterMailIcon = styled(MailIcon)`
  width: 1.25rem;
  height: 1.25rem;
`

const Hint = styled.p`
  margin: 0;
  width: 100%;
  color: ${({ theme }) => theme.textSecondary};
  font-size: 0.73rem;
  line-height: 1.35;
  text-align: center;
`

const EmptyPanel = styled(Panel)`
  align-items: flex-start;
`

const EmptyTitle = styled.h2`
  margin: 0;
  font-size: 1rem;
`

const EmptyText = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.neutral};
  font-size: 0.84rem;
  line-height: 1.45;
`

function getLicenseText(licenseStatus: LicenseStatus | undefined) {
  switch (licenseStatus) {
    case 'active':
      return 'Active'
    case 'warning':
      return 'Near expiry'
    case 'inactive':
      return 'Inactive'
    case 'error':
      return 'Unavailable'
    default:
      return 'Pending'
  }
}

function getLicenseTone(licenseStatus: LicenseStatus | undefined) {
  switch (licenseStatus) {
    case 'active':
      return 'success' as const
    case 'warning':
      return 'warn' as const
    case 'inactive':
    case 'error':
      return 'danger' as const
    default:
      return 'neutral' as const
  }
}

function getScopeLabel(world?: string | null, t?: number | null) {
  if (!world) {
    return '-'
  }

  return `${world}:${t ?? 'main'}`
}

function getRuntimeLabel({
  active,
  enabledByUser,
  hasPlayerIdentity,
}: {
  active?: boolean
  enabledByUser?: boolean | null
  hasPlayerIdentity: boolean
}) {
  if (hasPlayerIdentity && enabledByUser === false) {
    return 'Off'
  }

  if (active) {
    return 'Running'
  }

  return 'Ready'
}

function getRuntimeTone({
  active,
  enabledByUser,
  hasPlayerIdentity,
}: {
  active?: boolean
  enabledByUser?: boolean | null
  hasPlayerIdentity: boolean
}) {
  if (hasPlayerIdentity && enabledByUser === false) {
    return 'danger' as const
  }

  if (active) {
    return 'success' as const
  }

  return 'neutral' as const
}

const FEATURE_LABELS = [
  ['Premium', 'Premium account'],
  ['FarmAssistent', 'Farm assistant'],
  ['AccountManager', 'Account manager'],
] as const

function getFeatureTone(feature?: { possible?: boolean; active?: boolean } | null) {
  if (!feature || feature.possible !== true) {
    return 'neutral' as const
  }

  return feature.active === true ? 'success' as const : 'warn' as const
}

function formatNumberValue(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }

  return new Intl.NumberFormat('pt-BR').format(value)
}

function formatDateStarted(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null
  }

  const timestampMs = value < 1_000_000_000_000 ? value * 1000 : value
  const date = new Date(timestampMs)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  return new Intl.DateTimeFormat('pt-BR').format(date)
}

export default function App() {
  const rootRef = useRef<HTMLElement | null>(null)
  const avatarRefreshKeyRef = useRef<string | null>(null)
  const [state, setState] = useState<PopupState | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingEnabledByUser, setSavingEnabledByUser] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadPopupState = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) {
      setLoading(true)
    }

    setError(null)

    try {
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      })
      const targetTab = tabs.find(
        (tab) => typeof tab.id === 'number' && typeof tab.windowId === 'number',
      ) || null

      const response = await chrome.runtime.sendMessage({
        extensionId: chrome.runtime.id,
        type: POPUP_STATE_MESSAGE_TYPE,
        targetTabId: targetTab?.id ?? null,
        targetWindowId: targetTab?.windowId ?? null,
      }) as PopupState

      if (!response?.ok) {
        throw new Error(response?.reason || 'Unable to load popup state')
      }

      setState(response)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setState(null)
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void loadPopupState()
  }, [loadPopupState])

  useEffect(() => {
    const onStorageChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== 'local') {
        return
      }

      if (
        !changes[RUNNER_STORAGE_KEY]
        && !changes[TAB_CONTEXT_STORAGE_KEY]
        && !changes[WINDOW_LOCK_STORAGE_KEY]
        && !changes[WORLD_PLAYERS_STORAGE_KEY]
        && !changes[PLAYER_AVATAR_BY_SCOPE_KEY_STORAGE_KEY]
      ) {
        return
      }

      void loadPopupState({ silent: true })
    }

    chrome.storage.onChanged.addListener(onStorageChanged)

    return () => {
      chrome.storage.onChanged.removeListener(onStorageChanged)
    }
  }, [loadPopupState])

  useEffect(() => {
    const tabId = state?.tabId
    const playerId = state?.playerId
    const world = state?.world
    const refreshKey = (
      typeof tabId === 'number'
      && typeof playerId === 'number'
      && typeof world === 'string'
    )
      ? `${tabId}:${world}:${playerId}`
      : null

    if (!refreshKey) {
      avatarRefreshKeyRef.current = null
      return
    }

    const avatarUpdatedAtMs = Date.parse(state?.avatarUpdatedAt || '')
    const shouldRefresh = (
      !Number.isFinite(avatarUpdatedAtMs)
      || (Date.now() - avatarUpdatedAtMs) >= PLAYER_AVATAR_TTL_MS
    )

    if (!shouldRefresh) {
      avatarRefreshKeyRef.current = null
      return
    }

    if (avatarRefreshKeyRef.current === refreshKey) {
      return
    }

    avatarRefreshKeyRef.current = refreshKey

    void chrome.tabs.sendMessage(tabId, {
      extensionId: chrome.runtime.id,
      type: SUPPORT_SYNC_PLAYER_AVATAR_MESSAGE_TYPE,
    }).catch(() => {
      avatarRefreshKeyRef.current = null
    })
  }, [
    state?.avatarUpdatedAt,
    state?.playerId,
    state?.tabId,
    state?.world,
  ])

  useEffect(() => {
    const rootEl = rootRef.current

    if (!rootEl) {
      return undefined
    }

    const tooltip = new Tooltip({
      tooltipId: 'go-extension-popup-tooltip',
    })

    return tooltip.bind(rootEl, '[data-popup-title]', (el) => el.getAttribute('data-popup-title'))
  }, [])

  const handleEnabledByUserChange = useCallback(async () => {
    if (savingEnabledByUser || typeof state?.playerId !== 'number' || !state?.world) {
      return
    }

    setSavingEnabledByUser(true)
    setError(null)

    try {
      const response = await chrome.runtime.sendMessage({
        extensionId: chrome.runtime.id,
        type: SET_ENABLED_BY_USER_MESSAGE_TYPE,
        world: state.world,
        playerId: state.playerId,
        enabledByUser: !(state.enabledByUser === true),
        targetTabId: state.tabId ?? null,
        targetWindowId: state.windowId ?? null,
      }) as PopupState

      if (!response?.ok) {
        throw new Error(response?.reason || 'Unable to update player state')
      }

      setState(response)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSavingEnabledByUser(false)
    }
  }, [savingEnabledByUser, state])

  const isReady = state?.supported && state?.ready
  const hasPlayerIdentity = typeof state?.playerId === 'number'
  const playerEnabledByUserState = hasPlayerIdentity && typeof state?.enabledByUser === 'boolean'
    ? state.enabledByUser
    : null
  const isPlayerEnabledByUser = playerEnabledByUserState === true
  const runtimeLabel = getRuntimeLabel({
    active: state?.active,
    enabledByUser: state?.enabledByUser,
    hasPlayerIdentity,
  })
  const runtimeTone = getRuntimeTone({
    active: state?.active,
    enabledByUser: state?.enabledByUser,
    hasPlayerIdentity,
  })
  const canToggleEnabledByUser = hasPlayerIdentity && !savingEnabledByUser
  const enabledByUserTooltip = !hasPlayerIdentity
    ? 'Waiting for player identification'
    : isPlayerEnabledByUser
      ? 'Turn off for this player'
      : 'Turn on for this player'
  const playerMetrics = [
    {
      key: 'points',
      label: 'Points',
      value: formatNumberValue(state?.points),
    },
    {
      key: 'rank',
      label: 'Ranking',
      value: formatNumberValue(state?.rank),
    },
    {
      key: 'villages',
      label: 'Villages',
      value: formatNumberValue(state?.villages),
    },
    {
      key: 'date-started',
      label: 'Since',
      value: formatDateStarted(state?.dateStarted),
    },
  ].filter((entry) => Boolean(entry.value))
  const featureItems = FEATURE_LABELS
    .map(([featureKey, label]) => {
      const feature = state?.features?.[featureKey] ?? null

      if (!feature) {
        return null
      }

      return {
        key: featureKey,
        label,
        tone: getFeatureTone(feature),
      }
    })
    .filter((entry): entry is { key: string; label: string; tone: 'success' | 'warn' | 'neutral' } => entry !== null)

  return (
    <Root ref={rootRef}>
      <Shell>
        <Header>
          <Brand>
            <LogoLink showLabel={false} compact />
          </Brand>
        </Header>

        {loading ? (
          <Loading label="Consulting active tab state" />
        ) : error ? (
          <EmptyPanel>
            <EmptyTitle>Popup unavailable</EmptyTitle>
            <EmptyText>{error}</EmptyText>
          </EmptyPanel>
        ) : !state?.supported ? (
          <EmptyPanel>
            <EmptyTitle>Open it on a Tribal Wars tab</EmptyTitle>
            <EmptyText>
              The popup is ready, but it only shows data when the active tab belongs to the game.
            </EmptyText>
          </EmptyPanel>
        ) : (
          <Panel>
            <BotSection>
              <UserCard>
                <Avatar src={state?.avatarUrl || userUrl} alt={state?.playerName || 'Player'} />
                <UserMeta>
                  <UserLine>
                    {state?.world ? `${state.world} - ` : ''}
                    {state?.playerName || 'Player not identified yet'}
                  </UserLine>
                  <SubLine>
                    {state?.context === 'LOGIN'
                      ? 'Login context'
                      : state?.context === 'GAME'
                        ? 'Game context'
                        : 'Waiting for prepared context'}
                  </SubLine>
                  <Pills>
                    <Pill $tone={runtimeTone}>
                      {runtimeLabel}
                    </Pill>
                    <Pill $tone={getLicenseTone(state?.license?.status)}>
                      License {getLicenseText(state?.license?.status)}
                    </Pill>
                    {state?.isTryConfirm ? (
                      <Pill $tone="danger">Try Confirm</Pill>
                    ) : null}
                  </Pills>
                </UserMeta>
                <UserSwitchSlot>
                  <PlayerEnabledByUserSwitch
                    $enabledByUser={playerEnabledByUserState}
                    $disabled={!canToggleEnabledByUser}
                    data-popup-title={enabledByUserTooltip}
                  >
                    <input
                      type="checkbox"
                      checked={isPlayerEnabledByUser}
                      disabled={!canToggleEnabledByUser}
                      aria-label="Toggle current player execution"
                      onChange={() => { void handleEnabledByUserChange() }}
                    />
                  </PlayerEnabledByUserSwitch>
                </UserSwitchSlot>
              </UserCard>

              <TechnicalMeta>
                <TechnicalMetaItem>
                  <strong>Scope:</strong> {getScopeLabel(state?.world, state?.t)}
                </TechnicalMetaItem>
                {typeof state?.playerId === 'number' ? (
                  <TechnicalMetaItem>
                    <strong>Player:</strong> #{state.playerId}
                  </TechnicalMetaItem>
                ) : null}
                {typeof state?.tabId === 'number' ? (
                  <TechnicalMetaItem>
                    <strong>Tab:</strong> #{state.tabId}
                  </TechnicalMetaItem>
                ) : null}
                {typeof state?.windowId === 'number' ? (
                  <TechnicalMetaItem>
                    <strong>Window:</strong> #{state.windowId}
                  </TechnicalMetaItem>
                ) : null}
              </TechnicalMeta>
            </BotSection>

            <TwSection>
              {featureItems.length ? (
                <FeatureRow>
                  {featureItems.map((feature) => (
                    <FeaturePill key={feature.key} $tone={feature.tone}>
                      {feature.label}
                    </FeaturePill>
                  ))}
                </FeatureRow>
              ) : null}

              {playerMetrics.length ? (
                <Grid>
                  {playerMetrics.map((metric) => (
                    <Cell key={metric.key}>
                      <Label>{metric.label}</Label>
                      <Value>{metric.value}</Value>
                    </Cell>
                  ))}
                </Grid>
              ) : null}
            </TwSection>

            {!isReady ? (
              <Hint>
                The tab already belongs to Tribal Wars, but the game.prepared context has not
                reached the service worker yet.
              </Hint>
            ) : null}
          </Panel>
        )}

        <Footer>
          <FooterLinkItens>
            <FooterLink
              href="https://wa.me/5511916302834"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open WhatsApp contact in a new tab"
              data-popup-title="Fale conosco"
            >
              <FooterIcon aria-hidden="true" />
            </FooterLink>
            <FooterMailLink
              href={SUPPORT_EMAIL_HREF}
              aria-label="Open email client"
              data-popup-title={`Envie um e-mail para ${SUPPORT_EMAIL}`}
            >
              <FooterMailIcon aria-hidden="true" />
            </FooterMailLink>
          </FooterLinkItens>
          <Hint>
            {hasPlayerIdentity && state?.enabledByUser === false
              ? 'The bot is turned off for this player.'
              : state?.active
              ? 'The bot is marked to run on this tab.'
              : 'The popup follows the active Tribal Wars tab, even when it is not executing there.'}
          </Hint>
        </Footer>
      </Shell>
    </Root>
  )
}
