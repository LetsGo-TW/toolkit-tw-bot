import { useCallback, useEffect, useState } from 'react'
import styled from 'styled-components'
import { extensionVersion } from '@toolkit-tw-bot/release'
import userUrl from '../../icons/user.png'
import LogoLink from '../logo'

const POPUP_STATE_MESSAGE_TYPE = 'GET_POPUP_STATE'
const RUNNER_STORAGE_KEY = 'runnerByScope'
const TAB_CONTEXT_STORAGE_KEY = 'tabContextByTabId'
const WINDOW_LOCK_STORAGE_KEY = 'windowLock'

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
  isTryConfirm?: boolean
  active?: boolean
  ready?: boolean
  licenseStatus?: 'unknown' | 'active' | 'warning' | 'inactive' | 'error' | null
}

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
  gap: 0.85rem;
`

const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
`

const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
`

const Version = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.3rem 0.55rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.surfaceBorderStrong};
  background: ${({ theme }) => theme.surfaceOverlay};
  color: ${({ theme }) => theme.textSecondary};
  font-size: 0.68rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
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
  align-items: center;
  gap: 0.75rem;
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
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
`

const Value = styled.strong`
  font-size: 0.88rem;
  line-height: 1.2;
  word-break: break-word;
`

const Footer = styled.footer`
  display: flex;
  align-items: center;
`

const Hint = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.textSecondary};
  font-size: 0.73rem;
  line-height: 1.35;
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
  color: ${({ theme }) => theme.textSecondary};
  font-size: 0.84rem;
  line-height: 1.45;
`

function getLicenseText(licenseStatus: PopupState['licenseStatus']) {
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

function getLicenseTone(licenseStatus: PopupState['licenseStatus']) {
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

export default function App() {
  const [state, setState] = useState<PopupState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadPopupState = useCallback(async () => {
    setLoading(true)
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
      setLoading(false)
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
      ) {
        return
      }

      void loadPopupState()
    }

    chrome.storage.onChanged.addListener(onStorageChanged)

    return () => {
      chrome.storage.onChanged.removeListener(onStorageChanged)
    }
  }, [loadPopupState])

  const isReady = state?.supported && state?.ready

  return (
    <Root>
      <Shell>
        <Header>
          <Brand>
            <LogoLink subtitle="Player Assistant" />
          </Brand>
          <Version>v{extensionVersion}</Version>
        </Header>

        {loading ? (
          <EmptyPanel>
            <EmptyTitle>Loading...</EmptyTitle>
            <EmptyText>Consulting the active tab state in the service worker.</EmptyText>
          </EmptyPanel>
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
            <UserCard>
              <Avatar src={userUrl} alt="Player" />
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
                  <Pill $tone={state?.active ? 'success' : 'neutral'}>
                    {state?.active ? 'Running' : 'Ready'}
                  </Pill>
                  <Pill $tone={getLicenseTone(state?.licenseStatus)}>
                    License {getLicenseText(state?.licenseStatus)}
                  </Pill>
                  {state?.isTryConfirm ? (
                    <Pill $tone="danger">Try Confirm</Pill>
                  ) : null}
                </Pills>
              </UserMeta>
            </UserCard>

            <Grid>
              <Cell>
                <Label>Scope</Label>
                <Value>{getScopeLabel(state?.world, state?.t)}</Value>
              </Cell>
              <Cell>
                <Label>Player ID</Label>
                <Value>{state?.playerId ?? '-'}</Value>
              </Cell>
              <Cell>
                <Label>Tab</Label>
                <Value>#{state?.tabId ?? '-'}</Value>
              </Cell>
              <Cell>
                <Label>Window</Label>
                <Value>#{state?.windowId ?? '-'}</Value>
              </Cell>
            </Grid>

            {!isReady ? (
              <Hint>
                The tab already belongs to Tribal Wars, but the game.prepared context has not
                reached the service worker yet.
              </Hint>
            ) : null}
          </Panel>
        )}

        <Footer>
          <Hint>
            {state?.active
              ? 'The bot is marked to run on this tab.'
              : 'The popup follows the active Tribal Wars tab, even when it is not executing there.'}
          </Hint>
        </Footer>
      </Shell>
    </Root>
  )
}
