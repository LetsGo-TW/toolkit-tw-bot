import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react'
import styled, { css, keyframes } from 'styled-components'
import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'
import Tooltip from '@toolkit-tw-bot/document/tooltip'
import { SUPPORT_SYNC_PLAYER_AVATAR_MESSAGE_TYPE } from '../../content-scripts/vanilla/isolated/top/idle/support/message-types'
import {
  POPUP_REFRESH_MESSAGE_TYPE,
  VERIFY_WORLD_PLAYER_LICENSE_MESSAGE_TYPE,
} from '../../service-worker/message/types'
import {
  createDefaultSmartSessionConfig,
  MAX_SMART_LONG_REST_DURATION_DELAY_MINUTES,
  MAX_SMART_LONG_REST_INTERVAL_HOURS,
  MAX_SMART_LONG_REST_START_DELAY_MINUTES,
  MAX_SMART_SHORT_BREAK_DELAY_MINUTES,
  MAX_SMART_SHORT_BREAK_DURATION_MINUTES,
  MAX_SMART_SHORT_BREAK_EVERY_MINUTES,
  MIN_SMART_LONG_REST_DURATION_DELAY_MINUTES,
  MIN_SMART_LONG_REST_DURATION_MINUTES,
  MIN_SMART_LONG_REST_START_DELAY_MINUTES,
  MIN_SMART_SHORT_BREAK_DELAY_MINUTES,
  MIN_SMART_SHORT_BREAK_DURATION_MINUTES,
  MIN_SMART_SHORT_BREAK_EVERY_MINUTES,
  getRuntimeStatus,
  type ExtensionLicenseState,
  type FeaturesMap,
  type LicenseStatus,
  type RuntimeStatus,
  type SmartSessionConfig,
  type SmartSessionLongRestMode,
} from '../../types'
import userUrl from '../../img/user.png'
import LogoLink from '../components/logo'
import Loading from '../components/loading'
import { PlayerEnabledByUserSwitch, ToggleSwitch } from '../components/player-enabled-by-user-switch'

const POPUP_STATE_MESSAGE_TYPE = 'GET_POPUP_STATE'
const SET_ENABLED_BY_USER_MESSAGE_TYPE = 'SET_ENABLED_BY_USER'
const SET_RECONNECT_ON_SESSION_EXPIRED_MESSAGE_TYPE = 'SET_RECONNECT_ON_SESSION_EXPIRED'
const SET_SMART_SESSION_CONFIG_MESSAGE_TYPE = 'SET_SMART_SESSION_CONFIG'
const RUNNER_STORAGE_KEY = 'runnerByScope'
const WINDOW_LOCK_STORAGE_KEY = 'windowLock'
const WORLD_PLAYERS_STORAGE_KEY = 'worldPlayers'
const SUPPORT_EMAIL = 'letsgo.tribalwars@gmail.com'
const SUPPORT_EMAIL_HREF = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Let's GO! Support")}`
const PLAYER_AVATAR_TTL_MS = 3 * 60 * 60 * 1000

type PopupView = 'main' | 'smart-session'

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
  updatedAt?: string | null
  avatarUrl?: string | null
  avatarUpdatedAt?: string | null
  licenseDueAt?: number | null
  tokenExpiresAt?: number | null
  nextPostLicenseButtonAt?: number | null
  isConnectServerError?: boolean
  isNetError?: boolean
  enabledByUser?: boolean | null
  isBotProtected?: boolean
  reconnectOnSessionExpired?: boolean | null
  smartSession?: SmartSessionConfig | null
  isTryConfirm?: boolean
  active?: boolean
  ready?: boolean
  license?: ExtensionLicenseState | null
}

type PopupRefreshMessage = {
  type: typeof POPUP_REFRESH_MESSAGE_TYPE
  tabId?: number | null
  windowId?: number | null
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
  updatedAt?: string | null
  isConnectServerError?: boolean
  isNetError?: boolean
  enabledByUser?: boolean | null
  isBotProtected?: boolean
  reconnectOnSessionExpired?: boolean | null
  smartSession?: SmartSessionConfig | null
  isTryConfirm?: boolean
  active?: boolean
  license?: ExtensionLicenseState | null
}

type IconProps = ComponentProps<'svg'>

const syncPulse = keyframes`
  0% {
    opacity: 0.2;
    transform: translateX(-22%) scaleX(0.42);
  }

  42% {
    opacity: 0.9;
    transform: translateX(0) scaleX(1);
  }

  100% {
    opacity: 0.26;
    transform: translateX(0) scaleX(1);
  }
`

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

const LicenseBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
`

const LicenseRefreshButton = styled.button<{ $tone: 'success' | 'warn' | 'danger' | 'neutral' }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.65rem;
  min-width: 1.65rem;
  height: 1.65rem;
  padding: 0;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.borderSoft};
  background: ${({ $tone, theme }) => {
    switch ($tone) {
      case 'success':
        return `${theme.success}18`
      case 'warn':
        return `${theme.warn}18`
      case 'danger':
        return `${theme.danger}18`
      default:
        return `${theme.neutral}18`
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
  transition: opacity 0.18s ease, transform 0.18s ease;

  &:disabled {
    opacity: 0.45;
    cursor: default;
    transform: none;
  }

  &:not(:disabled):hover {
    transform: rotate(-18deg);
  }
`

function RefreshIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  )
}

const RefreshSvg = styled(RefreshIcon)`
  width: 0.92rem;
  height: 0.92rem;
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

const UpdateMark = styled.div`
  display: inline-flex;
  align-self: flex-end;
  align-items: center;
  gap: 0.45rem;
  margin-top: 0.08rem;
  color: ${({ theme }) => theme.neutral};
  font-size: 0.58rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  opacity: 0.76;
`

const UpdateDot = styled.span`
  width: 0.34rem;
  height: 0.34rem;
  border-radius: 999px;
  background: ${({ theme }) => theme.success};
  box-shadow: 0 0 0.45rem ${({ theme }) => `${theme.success}66`};
  flex-shrink: 0;
`

const UpdateTrack = styled.span<{ $animate?: boolean }>`
  position: relative;
  display: inline-flex;
  width: 5.8rem;
  height: 0.22rem;
  border-radius: 999px;
  overflow: hidden;
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.02) 0%,
    ${({ theme }) => `${theme.success}14`} 50%,
    rgba(255, 255, 255, 0.02) 100%
  );

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    opacity: ${({ $animate }) => ($animate ? 1 : 0)};
    background: linear-gradient(
      90deg,
      transparent 0%,
      ${({ theme }) => `${theme.success}88`} 48%,
      transparent 100%
    );
    animation: ${({ $animate }) => ($animate ? css`${syncPulse} 900ms ease` : 'none')};
    transform-origin: center;
  }
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

const SettingRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  padding: 0.65rem 0.7rem;
  border-radius: 0.7rem;
  background: ${({ theme }) => theme.surfaceInner};
`

const SettingText = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
`

const SettingTitle = styled.strong`
  font-size: 0.8rem;
  line-height: 1.2;
`

const SettingDescription = styled.span`
  color: ${({ theme }) => theme.textSecondary};
  font-size: 0.68rem;
  line-height: 1.35;
`

const SmartSettingCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  padding: 0.7rem;
  border-radius: 0.7rem;
  background: ${({ theme }) => theme.surfaceInner};
`

const SmartSettingHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
`

const SmartSettingInputs = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.55rem;
`

const SmartSettingField = styled.label`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.28rem;
`

const SmartSettingFieldLabel = styled.span`
  color: ${({ theme }) => theme.textLabel};
  font-size: 0.58rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
`

const SmartSettingInput = styled.input`
  width: 100%;
  min-height: 2rem;
  padding: 0.45rem 0.55rem;
  border-radius: 0.55rem;
  border: 1px solid ${({ theme }) => theme.borderSoft};
  background: ${({ theme }) => theme.surface};
  color: ${({ theme }) => theme.textPrimary};
  font-size: 0.78rem;

  &:disabled {
    opacity: 0.5;
  }
`

const SmartSettingSelect = styled.select`
  width: 100%;
  min-height: 2rem;
  padding: 0.45rem 0.55rem;
  border-radius: 0.55rem;
  border: 1px solid ${({ theme }) => theme.borderSoft};
  background: ${({ theme }) => theme.surface};
  color: ${({ theme }) => theme.textPrimary};
  font-size: 0.78rem;

  &:disabled {
    opacity: 0.5;
  }
`

const SmartSettingActions = styled.div`
  display: flex;
  justify-content: flex-end;
`

const SmartSettingButton = styled.button`
  min-height: 2rem;
  padding: 0.45rem 0.8rem;
  border: 1px solid ${({ theme }) => theme.borderSoft};
  border-radius: 0.55rem;
  background: ${({ theme }) => `${theme.success}18`};
  color: ${({ theme }) => theme.success};
  font-size: 0.74rem;
  font-weight: 600;

  &:disabled {
    opacity: 0.45;
    cursor: default;
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
      return 'LICENSE ACTIVE'
    case 'warning':
      return 'LICENSE WARNING'
    case 'inactive':
      return 'NO LICENSE'
    case 'session-expired':
      return 'SESSION EXPIRED'
    case 'error':
      return 'LICENSE ERROR'
    default:
      return 'LICENSE PENDING'
  }
}

function getLicenseTone(licenseStatus: LicenseStatus | undefined) {
  switch (licenseStatus) {
    case 'active':
      return 'success' as const
    case 'warning':
    case 'session-expired':
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

function getRuntimeLabel(runtimeStatus: RuntimeStatus) {
  switch (runtimeStatus) {
    case 'off':
      return 'OFF'
    case 'net-error':
      return 'NET:ERROR'
    case 'connect-error':
      return 'CONNECT:ERROR'
    case 'running':
      return 'RUNNING'
    default:
      return 'READY'
  }
}

function getRuntimeTone(runtimeStatus: RuntimeStatus) {
  switch (runtimeStatus) {
    case 'off':
      return 'danger' as const
    case 'net-error':
    case 'connect-error':
      return 'warn' as const
    case 'running':
      return 'success' as const
    default:
      return 'neutral' as const
  }
}

function getRuntimeTooltip(runtimeStatus: RuntimeStatus) {
  switch (runtimeStatus) {
    case 'off':
      return 'Execution is turned off by the user for this player.'
    case 'net-error':
      return 'The user internet connection appears to be unavailable. The bot cannot keep running until connectivity returns.'
    case 'connect-error':
      return "The Let's GO server or CDN could not be reached. The extension will retry automatically."
    case 'running':
      return 'The bot is currently allowed to run on this tab.'
    default:
      return 'This tab is recognized, but it is not the one currently executing the bot.'
  }
}

function getLicenseTooltip({
  licenseStatus,
  formattedLicenseDueAt,
  formattedTokenExpiresAt,
  nextRetryAt,
}: {
  licenseStatus: LicenseStatus | undefined
  formattedLicenseDueAt?: string | null
  formattedTokenExpiresAt?: string | null
  nextRetryAt?: string | null
}) {
  switch (licenseStatus) {
    case 'active':
      if (formattedLicenseDueAt && formattedTokenExpiresAt) {
        return `The license is active until ${formattedLicenseDueAt}. Session expires: ${formattedTokenExpiresAt}.`
      }

      return formattedLicenseDueAt
        ? `The license is active until ${formattedLicenseDueAt}.`
        : formattedTokenExpiresAt
          ? `The license is active for this player. Session expires: ${formattedTokenExpiresAt}.`
          : 'The license is active for this player.'
    case 'warning':
      if (formattedLicenseDueAt && formattedTokenExpiresAt) {
        return `The license is active and close to expiry. It expires at ${formattedLicenseDueAt}. Session expires: ${formattedTokenExpiresAt}.`
      }

      return formattedLicenseDueAt
        ? `The license is active and close to expiry. It expires at ${formattedLicenseDueAt}.`
        : formattedTokenExpiresAt
          ? `The license is active and close to expiry. Session expires: ${formattedTokenExpiresAt}.`
          : 'The license is active and close to expiry.'
    case 'inactive':
      return 'No active license was found for this player.'
    case 'session-expired':
      return nextRetryAt
        ? `The token could not be validated. The bot stays stopped until the session is validated again. Next automatic retry after ${nextRetryAt}.`
        : 'The token could not be validated. The bot stays stopped until the session is validated again.'
    case 'error':
      return 'The license state could not be resolved due to an unexpected error.'
    default:
      return 'The license state has not been determined yet.'
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

const LICENSE_TOOLTIP_ICON_HTML = [
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
  '<path d="M12 3 5 6v6c0 4.6 2.82 8.27 7 9.7 4.18-1.43 7-5.1 7-9.7V6l-7-3Z"></path>',
  '<path d="m9.3 12.2 1.8 1.8 3.8-3.8"></path>',
  '</svg>',
].join('')

function getLicenseTooltipHtml({
  licenseStatus,
  formattedLicenseDueAt,
  formattedTokenExpiresAt,
}: {
  licenseStatus: LicenseStatus | undefined
  formattedLicenseDueAt?: string | null
  formattedTokenExpiresAt?: string | null
}) {
  if (licenseStatus !== 'active' && licenseStatus !== 'warning') {
    return null
  }

  const headline = licenseStatus === 'warning'
    ? formattedLicenseDueAt
      ? `License active until ${formattedLicenseDueAt}. Close to expiry.`
      : 'License active and close to expiry.'
    : formattedLicenseDueAt
      ? `License active until ${formattedLicenseDueAt}.`
      : 'License active for this player.'

  const sessionExpiresLine = formattedTokenExpiresAt
    ? `<div class="go-tooltip-license-meta">Session expires: ${escapeHtml(formattedTokenExpiresAt)}</div>`
    : ''

  return [
    `<div class="go-tooltip-license${licenseStatus === 'warning' ? ' is-warning' : ''}">`,
    '<div class="go-tooltip-license-row">',
    `<span class="go-tooltip-license-icon">${LICENSE_TOOLTIP_ICON_HTML}</span>`,
    `<span class="go-tooltip-license-text">${escapeHtml(headline)}</span>`,
    '</div>',
    sessionExpiresLine,
    '</div>',
  ].join('')
}

const FEATURE_LABELS = [
  ['Premium', 'Premium account'],
  ['FarmAssistent', 'Farm assistant'],
  ['AccountManager', 'Account manager'],
] as const

type FeatureItem = {
  key: typeof FEATURE_LABELS[number][0]
  label: typeof FEATURE_LABELS[number][1]
  tone: ReturnType<typeof getFeatureTone>
}

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

function formatUpdatedAt(value?: string | null) {
  if (typeof value !== 'string' || !value.trim()) {
    return null
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}

function formatDateTime(value?: number | string | null) {
  if (value == null) {
    return null
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatRetryAt(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= Date.now()) {
    return null
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function parsePositiveIntegerInput(value: string) {
  if (!value.trim()) {
    return null
  }

  const numericValue = Number(value)

  if (!Number.isFinite(numericValue) || numericValue < 1) {
    return null
  }

  return Math.round(numericValue)
}

function formatPositiveIntegerInput(value: number) {
  return String(Math.max(1, Math.round(value)))
}

function parseSmartSessionLongRestMode(value: string): SmartSessionLongRestMode | null {
  return value === 'interval' || value === 'schedule'
    ? value
    : null
}

function parsePositiveIntegerInRange(
  value: string,
  {
    min,
    max,
  }: {
    min: number
    max?: number
  },
) {
  const normalized = parsePositiveIntegerInput(value)

  if (normalized === null || normalized < min) {
    return null
  }

  if (typeof max === 'number' && normalized > max) {
    return null
  }

  return normalized
}

function parseScheduledTimeInput(value: string) {
  const normalized = value.trim()

  if (!normalized) {
    return null
  }

  const match = normalized.match(/^(\d{1,2})(?::(\d{1,2}))?$/)

  if (!match) {
    return null
  }

  const hours = Number(match[1])
  const minutes = Number(match[2] ?? '0')

  if (
    !Number.isInteger(hours)
    || !Number.isInteger(minutes)
    || hours < 0
    || hours > 23
    || minutes < 0
    || minutes > 59
  ) {
    return null
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function parseScheduledTimesInput(value: string) {
  const normalized = Array.from(
    new Set(
      value
        .split(',')
        .map((part) => parseScheduledTimeInput(part))
        .filter((part): part is string => typeof part === 'string'),
    ),
  )

  return normalized.length
    ? normalized
    : null
}

function formatScheduledTimesInput(values: string[]) {
  return values.join(', ')
}

export default function App() {
  const rootRef = useRef<HTMLElement | null>(null)
  const avatarRefreshKeyRef = useRef<string | null>(null)
  const lastSeenUpdatedAtRef = useRef<string | null>(null)
  const initialSmartSession = createDefaultSmartSessionConfig()
  const [popupView, setPopupView] = useState<PopupView>('main')
  const [state, setState] = useState<PopupState | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingEnabledByUser, setSavingEnabledByUser] = useState(false)
  const [savingReconnectOnSessionExpired, setSavingReconnectOnSessionExpired] = useState(false)
  const [savingSmartSession, setSavingSmartSession] = useState(false)
  const [shortBreakEveryDraft, setShortBreakEveryDraft] = useState(() => (
    formatPositiveIntegerInput(initialSmartSession.shortBreak.everyMinutes)
  ))
  const [shortBreakDurationDraft, setShortBreakDurationDraft] = useState(() => (
    formatPositiveIntegerInput(initialSmartSession.shortBreak.durationMinutes)
  ))
  const [shortBreakDelayDraft, setShortBreakDelayDraft] = useState(() => (
    formatPositiveIntegerInput(initialSmartSession.shortBreak.delayMinutes)
  ))
  const [longRestModeDraft, setLongRestModeDraft] = useState<SmartSessionLongRestMode>(initialSmartSession.longRest.mode)
  const [longRestIntervalHoursDraft, setLongRestIntervalHoursDraft] = useState(() => (
    formatPositiveIntegerInput(initialSmartSession.longRest.intervalHours)
  ))
  const [longRestDurationMinutesDraft, setLongRestDurationMinutesDraft] = useState(() => (
    formatPositiveIntegerInput(initialSmartSession.longRest.durationMinutes)
  ))
  const [longRestDurationDelayMinutesDraft, setLongRestDurationDelayMinutesDraft] = useState(() => (
    formatPositiveIntegerInput(initialSmartSession.longRest.durationDelayMinutes)
  ))
  const [longRestStartDelayMinutesDraft, setLongRestStartDelayMinutesDraft] = useState(() => (
    formatPositiveIntegerInput(initialSmartSession.longRest.startDelayMinutes)
  ))
  const [longRestScheduledTimesDraft, setLongRestScheduledTimesDraft] = useState(() => (
    formatScheduledTimesInput(initialSmartSession.longRest.scheduledTimes)
  ))
  const [checkingLicense, setCheckingLicense] = useState(false)
  const [updatePulseTick, setUpdatePulseTick] = useState(0)
  const [licenseRetryTick, setLicenseRetryTick] = useState(() => Date.now())
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
        extensionId: RELEASE_EXTENSION_ID,
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
        && !changes[WINDOW_LOCK_STORAGE_KEY]
        && !changes[WORLD_PLAYERS_STORAGE_KEY]
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
    const onRuntimeMessage = (
      received: unknown,
      _sender: chrome.runtime.MessageSender,
    ) => {
      if (
        !received
        || typeof received !== 'object'
        || (received as { type?: string }).type !== POPUP_REFRESH_MESSAGE_TYPE
      ) {
        return false
      }

      const refresh = received as PopupRefreshMessage

      setState((previous) => {
        if (!previous) {
          return previous
        }

        if (
          typeof refresh.tabId === 'number'
          && previous.tabId !== refresh.tabId
        ) {
          return previous
        }

        if (
          typeof refresh.windowId === 'number'
          && previous.windowId !== refresh.windowId
        ) {
          return previous
        }

        const next = { ...previous }

        if (Object.prototype.hasOwnProperty.call(refresh, 'context')) {
          next.context = refresh.context ?? null
        }

        if (Object.prototype.hasOwnProperty.call(refresh, 'world')) {
          next.world = refresh.world ?? null
        }

        if (Object.prototype.hasOwnProperty.call(refresh, 't')) {
          next.t = refresh.t ?? null
        }

        if (Object.prototype.hasOwnProperty.call(refresh, 'playerId')) {
          next.playerId = refresh.playerId ?? null
        }

        if (Object.prototype.hasOwnProperty.call(refresh, 'playerName')) {
          next.playerName = refresh.playerName ?? null
        }

        if (Object.prototype.hasOwnProperty.call(refresh, 'features')) {
          next.features = refresh.features ?? null
        }

        if (Object.prototype.hasOwnProperty.call(refresh, 'points')) {
          next.points = refresh.points ?? null
        }

        if (Object.prototype.hasOwnProperty.call(refresh, 'rank')) {
          next.rank = refresh.rank ?? null
        }

        if (Object.prototype.hasOwnProperty.call(refresh, 'villages')) {
          next.villages = refresh.villages ?? null
        }

        if (Object.prototype.hasOwnProperty.call(refresh, 'dateStarted')) {
          next.dateStarted = refresh.dateStarted ?? null
        }

        if (Object.prototype.hasOwnProperty.call(refresh, 'updatedAt')) {
          next.updatedAt = refresh.updatedAt ?? null
        }

        if (Object.prototype.hasOwnProperty.call(refresh, 'isConnectServerError')) {
          next.isConnectServerError = refresh.isConnectServerError === true
        }

        if (Object.prototype.hasOwnProperty.call(refresh, 'isNetError')) {
          next.isNetError = refresh.isNetError === true
        }

        if (Object.prototype.hasOwnProperty.call(refresh, 'enabledByUser')) {
          next.enabledByUser = refresh.enabledByUser ?? null
        }

        if (Object.prototype.hasOwnProperty.call(refresh, 'reconnectOnSessionExpired')) {
          next.reconnectOnSessionExpired = refresh.reconnectOnSessionExpired === true
        }

        if (Object.prototype.hasOwnProperty.call(refresh, 'smartSession')) {
          next.smartSession = refresh.smartSession ?? null
        }

        if (Object.prototype.hasOwnProperty.call(refresh, 'isBotProtected')) {
          next.isBotProtected = refresh.isBotProtected === true
        }

        if (Object.prototype.hasOwnProperty.call(refresh, 'isTryConfirm')) {
          next.isTryConfirm = refresh.isTryConfirm === true
        }

        if (Object.prototype.hasOwnProperty.call(refresh, 'active')) {
          next.active = refresh.active === true
        }

        if (Object.prototype.hasOwnProperty.call(refresh, 'license')) {
          next.license = refresh.license ?? null
        }

        return next
      })

      return false
    }

    chrome.runtime.onMessage.addListener(onRuntimeMessage)

    return () => {
      chrome.runtime.onMessage.removeListener(onRuntimeMessage)
    }
  }, [loadPopupState])

  useEffect(() => {
    const nextAt = state?.nextPostLicenseButtonAt

    if (typeof nextAt !== 'number' || !Number.isFinite(nextAt) || nextAt <= Date.now()) {
      return undefined
    }

    const timerId = window.setTimeout(() => {
      setLicenseRetryTick(Date.now())
    }, Math.max(0, nextAt - Date.now()) + 80)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [state?.nextPostLicenseButtonAt, checkingLicense])

  useEffect(() => {
    const updatedAt = state?.updatedAt ?? null

    if (!updatedAt) {
      lastSeenUpdatedAtRef.current = null
      return
    }

    if (lastSeenUpdatedAtRef.current === null) {
      lastSeenUpdatedAtRef.current = updatedAt
      return
    }

    if (lastSeenUpdatedAtRef.current !== updatedAt) {
      lastSeenUpdatedAtRef.current = updatedAt
      setUpdatePulseTick((current) => current + 1)
    }
  }, [state?.updatedAt])

  useEffect(() => {
    const smartSession = state?.smartSession ?? createDefaultSmartSessionConfig()

    setShortBreakEveryDraft(formatPositiveIntegerInput(smartSession.shortBreak.everyMinutes))
    setShortBreakDurationDraft(formatPositiveIntegerInput(smartSession.shortBreak.durationMinutes))
    setShortBreakDelayDraft(formatPositiveIntegerInput(smartSession.shortBreak.delayMinutes))
    setLongRestModeDraft(smartSession.longRest.mode)
    setLongRestIntervalHoursDraft(formatPositiveIntegerInput(smartSession.longRest.intervalHours))
    setLongRestDurationMinutesDraft(formatPositiveIntegerInput(smartSession.longRest.durationMinutes))
    setLongRestDurationDelayMinutesDraft(formatPositiveIntegerInput(smartSession.longRest.durationDelayMinutes))
    setLongRestStartDelayMinutesDraft(formatPositiveIntegerInput(smartSession.longRest.startDelayMinutes))
    setLongRestScheduledTimesDraft(formatScheduledTimesInput(smartSession.longRest.scheduledTimes))
  }, [
    state?.smartSession?.shortBreak.delayMinutes,
    state?.smartSession?.shortBreak.durationMinutes,
    state?.smartSession?.shortBreak.everyMinutes,
    state?.smartSession?.longRest.durationDelayMinutes,
    state?.smartSession?.longRest.intervalHours,
    state?.smartSession?.longRest.mode,
    state?.smartSession?.longRest.scheduledTimes,
    state?.smartSession?.longRest.startDelayMinutes,
    state?.smartSession?.longRest.durationMinutes,
  ])

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

    void chrome.tabs.sendMessage(tabId as number, {
      extensionId: RELEASE_EXTENSION_ID,
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

    return tooltip.bind(rootEl, '[data-popup-title], [data-popup-html]', (el) => {
      const html = el.getAttribute('data-popup-html')

      if (typeof html === 'string' && html.trim()) {
        return html
      }

      return el.getAttribute('data-popup-title')
    })
  }, [])

  const buildShortBreakSmartSessionPayload = useCallback(({ strict = false }: { strict?: boolean } = {}) => {
    const base = state?.smartSession ?? createDefaultSmartSessionConfig()
    const nextShortBreakEveryMinutes = strict
      ? parsePositiveIntegerInRange(shortBreakEveryDraft, {
        min: MIN_SMART_SHORT_BREAK_EVERY_MINUTES,
        max: MAX_SMART_SHORT_BREAK_EVERY_MINUTES,
      })
      : parsePositiveIntegerInRange(shortBreakEveryDraft, {
        min: MIN_SMART_SHORT_BREAK_EVERY_MINUTES,
        max: MAX_SMART_SHORT_BREAK_EVERY_MINUTES,
      }) ?? base.shortBreak.everyMinutes
    const nextShortBreakDurationMinutes = strict
      ? parsePositiveIntegerInRange(shortBreakDurationDraft, {
        min: MIN_SMART_SHORT_BREAK_DURATION_MINUTES,
        max: MAX_SMART_SHORT_BREAK_DURATION_MINUTES,
      })
      : parsePositiveIntegerInRange(shortBreakDurationDraft, {
        min: MIN_SMART_SHORT_BREAK_DURATION_MINUTES,
        max: MAX_SMART_SHORT_BREAK_DURATION_MINUTES,
      }) ?? base.shortBreak.durationMinutes
    const nextShortBreakDelayMinutes = strict
      ? parsePositiveIntegerInRange(shortBreakDelayDraft, {
        min: MIN_SMART_SHORT_BREAK_DELAY_MINUTES,
        max: MAX_SMART_SHORT_BREAK_DELAY_MINUTES,
      })
      : parsePositiveIntegerInRange(shortBreakDelayDraft, {
        min: MIN_SMART_SHORT_BREAK_DELAY_MINUTES,
        max: MAX_SMART_SHORT_BREAK_DELAY_MINUTES,
      }) ?? base.shortBreak.delayMinutes

    if (
      nextShortBreakEveryMinutes === null
      || nextShortBreakDurationMinutes === null
      || nextShortBreakDelayMinutes === null
    ) {
      return null
    }

    return {
      shortBreak: {
        enabled: base.shortBreak.enabled,
        everyMinutes: nextShortBreakEveryMinutes,
        durationMinutes: nextShortBreakDurationMinutes,
        delayMinutes: nextShortBreakDelayMinutes,
      },
      longRest: base.longRest,
    } satisfies SmartSessionConfig
  }, [
    shortBreakDelayDraft,
    shortBreakDurationDraft,
    shortBreakEveryDraft,
    state?.smartSession,
  ])

  const buildLongRestSmartSessionPayload = useCallback(({ strict = false }: { strict?: boolean } = {}) => {
    const base = state?.smartSession ?? createDefaultSmartSessionConfig()
    const nextLongRestMode = parseSmartSessionLongRestMode(longRestModeDraft) ?? base.longRest.mode
    const nextLongRestDurationMinutes = strict
      ? parsePositiveIntegerInRange(longRestDurationMinutesDraft, {
        min: MIN_SMART_LONG_REST_DURATION_MINUTES,
      })
      : parsePositiveIntegerInRange(longRestDurationMinutesDraft, {
        min: MIN_SMART_LONG_REST_DURATION_MINUTES,
      }) ?? base.longRest.durationMinutes
    const nextLongRestDurationDelayMinutes = strict
      ? parsePositiveIntegerInRange(longRestDurationDelayMinutesDraft, {
        min: MIN_SMART_LONG_REST_DURATION_DELAY_MINUTES,
        max: MAX_SMART_LONG_REST_DURATION_DELAY_MINUTES,
      })
      : parsePositiveIntegerInRange(longRestDurationDelayMinutesDraft, {
        min: MIN_SMART_LONG_REST_DURATION_DELAY_MINUTES,
        max: MAX_SMART_LONG_REST_DURATION_DELAY_MINUTES,
      }) ?? base.longRest.durationDelayMinutes
    const nextLongRestStartDelayMinutes = strict
      ? parsePositiveIntegerInRange(longRestStartDelayMinutesDraft, {
        min: MIN_SMART_LONG_REST_START_DELAY_MINUTES,
        max: MAX_SMART_LONG_REST_START_DELAY_MINUTES,
      })
      : parsePositiveIntegerInRange(longRestStartDelayMinutesDraft, {
        min: MIN_SMART_LONG_REST_START_DELAY_MINUTES,
        max: MAX_SMART_LONG_REST_START_DELAY_MINUTES,
      }) ?? base.longRest.startDelayMinutes
    const nextLongRestIntervalHours = strict
      ? parsePositiveIntegerInRange(longRestIntervalHoursDraft, {
        min: 1,
        max: MAX_SMART_LONG_REST_INTERVAL_HOURS,
      })
      : parsePositiveIntegerInRange(longRestIntervalHoursDraft, {
        min: 1,
        max: MAX_SMART_LONG_REST_INTERVAL_HOURS,
      }) ?? base.longRest.intervalHours
    const nextLongRestScheduledTimes = strict
      ? parseScheduledTimesInput(longRestScheduledTimesDraft)
      : parseScheduledTimesInput(longRestScheduledTimesDraft) ?? base.longRest.scheduledTimes

    if (
      nextLongRestDurationMinutes === null
      || nextLongRestDurationDelayMinutes === null
      || nextLongRestStartDelayMinutes === null
      || (
        nextLongRestMode === 'interval'
        && nextLongRestIntervalHours === null
      )
      || (
        nextLongRestMode === 'schedule'
        && nextLongRestScheduledTimes === null
      )
    ) {
      return null
    }

    return {
      shortBreak: base.shortBreak,
      longRest: {
        enabled: base.longRest.enabled,
        mode: nextLongRestMode,
        durationMinutes: nextLongRestDurationMinutes,
        durationDelayMinutes: nextLongRestDurationDelayMinutes,
        intervalHours: nextLongRestIntervalHours ?? base.longRest.intervalHours,
        startDelayMinutes: nextLongRestStartDelayMinutes,
        scheduledTimes: nextLongRestScheduledTimes ?? base.longRest.scheduledTimes,
      },
    } satisfies SmartSessionConfig
  }, [
    longRestDurationDelayMinutesDraft,
    longRestDurationMinutesDraft,
    longRestIntervalHoursDraft,
    longRestModeDraft,
    longRestScheduledTimesDraft,
    longRestStartDelayMinutesDraft,
    state?.smartSession,
  ])

  const persistSmartSession = useCallback(async (smartSession: SmartSessionConfig) => {
    if (
      savingSmartSession
      || typeof state?.playerId !== 'number'
      || !state?.world
    ) {
      return
    }

    setSavingSmartSession(true)
    setError(null)

    try {
      const response = await chrome.runtime.sendMessage({
        extensionId: RELEASE_EXTENSION_ID,
        type: SET_SMART_SESSION_CONFIG_MESSAGE_TYPE,
        world: state.world,
        playerId: state.playerId,
        smartSession,
        targetTabId: state.tabId ?? null,
        targetWindowId: state.windowId ?? null,
      }) as PopupState

      if (!response?.ok) {
        throw new Error(response?.reason || 'Unable to update smart session state')
      }

      setState(response)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSavingSmartSession(false)
    }
  }, [savingSmartSession, state])

  const handleEnabledByUserChange = useCallback(async () => {
    if (savingEnabledByUser || typeof state?.playerId !== 'number' || !state?.world) {
      return
    }

    setSavingEnabledByUser(true)
    setError(null)

    try {
      const response = await chrome.runtime.sendMessage({
        extensionId: RELEASE_EXTENSION_ID,
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

  const handleReconnectOnSessionExpiredChange = useCallback(async () => {
    if (
      savingReconnectOnSessionExpired
      || typeof state?.playerId !== 'number'
      || !state?.world
    ) {
      return
    }

    setSavingReconnectOnSessionExpired(true)
    setError(null)

    try {
      const response = await chrome.runtime.sendMessage({
        extensionId: RELEASE_EXTENSION_ID,
        type: SET_RECONNECT_ON_SESSION_EXPIRED_MESSAGE_TYPE,
        world: state.world,
        playerId: state.playerId,
        reconnectOnSessionExpired: !(state.reconnectOnSessionExpired === true),
        targetTabId: state.tabId ?? null,
        targetWindowId: state.windowId ?? null,
      }) as PopupState

      if (!response?.ok) {
        throw new Error(response?.reason || 'Unable to update reconnect state')
      }

      setState(response)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSavingReconnectOnSessionExpired(false)
    }
  }, [savingReconnectOnSessionExpired, state])

  const handleShortBreakToggleChange = useCallback(async () => {
    const base = state?.smartSession ?? createDefaultSmartSessionConfig()
    const nextSmartSession = buildShortBreakSmartSessionPayload()

    if (!nextSmartSession) {
      return
    }

    await persistSmartSession({
      ...nextSmartSession,
      shortBreak: {
        ...nextSmartSession.shortBreak,
        enabled: !base.shortBreak.enabled,
      },
    })
  }, [buildShortBreakSmartSessionPayload, persistSmartSession, state?.smartSession])

  const handleShortBreakSave = useCallback(async () => {
    const nextShortBreakEveryMinutes = parsePositiveIntegerInRange(shortBreakEveryDraft, {
      min: MIN_SMART_SHORT_BREAK_EVERY_MINUTES,
      max: MAX_SMART_SHORT_BREAK_EVERY_MINUTES,
    })
    const nextShortBreakDurationMinutes = parsePositiveIntegerInRange(shortBreakDurationDraft, {
      min: MIN_SMART_SHORT_BREAK_DURATION_MINUTES,
      max: MAX_SMART_SHORT_BREAK_DURATION_MINUTES,
    })
    const nextShortBreakDelayMinutes = parsePositiveIntegerInRange(shortBreakDelayDraft, {
      min: MIN_SMART_SHORT_BREAK_DELAY_MINUTES,
      max: MAX_SMART_SHORT_BREAK_DELAY_MINUTES,
    })
    const nextSmartSession = buildShortBreakSmartSessionPayload()

    if (
      nextShortBreakEveryMinutes === null
      || nextShortBreakDurationMinutes === null
      || nextShortBreakDelayMinutes === null
      || !nextSmartSession
    ) {
      setError('Short break every must be 3-60 minutes, duration 3-30 minutes, and delay 1-5 minutes.')
      return
    }

    await persistSmartSession({
      ...nextSmartSession,
      shortBreak: {
        ...nextSmartSession.shortBreak,
        everyMinutes: nextShortBreakEveryMinutes,
        durationMinutes: nextShortBreakDurationMinutes,
        delayMinutes: nextShortBreakDelayMinutes,
      },
    })
  }, [
    buildShortBreakSmartSessionPayload,
    persistSmartSession,
    shortBreakDelayDraft,
    shortBreakDurationDraft,
    shortBreakEveryDraft,
  ])

  const handleLongRestToggleChange = useCallback(async () => {
    const base = state?.smartSession ?? createDefaultSmartSessionConfig()
    const nextSmartSession = buildLongRestSmartSessionPayload()

    if (!nextSmartSession) {
      return
    }

    await persistSmartSession({
      ...nextSmartSession,
      longRest: {
        ...nextSmartSession.longRest,
        enabled: !base.longRest.enabled,
      },
    })
  }, [buildLongRestSmartSessionPayload, persistSmartSession, state?.smartSession])

  const handleLongRestSave = useCallback(async () => {
    const nextLongRestDurationMinutes = parsePositiveIntegerInRange(longRestDurationMinutesDraft, {
      min: MIN_SMART_LONG_REST_DURATION_MINUTES,
    })
    const nextLongRestDurationDelayMinutes = parsePositiveIntegerInRange(longRestDurationDelayMinutesDraft, {
      min: MIN_SMART_LONG_REST_DURATION_DELAY_MINUTES,
      max: MAX_SMART_LONG_REST_DURATION_DELAY_MINUTES,
    })
    const nextLongRestStartDelayMinutes = parsePositiveIntegerInRange(longRestStartDelayMinutesDraft, {
      min: MIN_SMART_LONG_REST_START_DELAY_MINUTES,
      max: MAX_SMART_LONG_REST_START_DELAY_MINUTES,
    })
    const nextLongRestIntervalHours = parsePositiveIntegerInRange(longRestIntervalHoursDraft, {
      min: 1,
      max: MAX_SMART_LONG_REST_INTERVAL_HOURS,
    })
    const nextLongRestScheduledTimes = parseScheduledTimesInput(longRestScheduledTimesDraft)
    const nextSmartSession = buildLongRestSmartSessionPayload()

    if (
      nextLongRestDurationMinutes === null
      || nextLongRestDurationDelayMinutes === null
      || nextLongRestStartDelayMinutes === null
      || !nextSmartSession
      || (
        nextSmartSession.longRest.mode === 'interval'
        && nextLongRestIntervalHours === null
      )
      || (
        nextSmartSession.longRest.mode === 'schedule'
        && nextLongRestScheduledTimes === null
      )
    ) {
      setError('Long rest fields are invalid for the selected mode.')
      return
    }

    await persistSmartSession({
      ...nextSmartSession,
      longRest: {
        ...nextSmartSession.longRest,
        durationMinutes: nextLongRestDurationMinutes,
        durationDelayMinutes: nextLongRestDurationDelayMinutes,
        intervalHours: nextLongRestIntervalHours ?? nextSmartSession.longRest.intervalHours,
        startDelayMinutes: nextLongRestStartDelayMinutes,
        scheduledTimes: nextLongRestScheduledTimes ?? nextSmartSession.longRest.scheduledTimes,
      },
    })
  }, [
    buildLongRestSmartSessionPayload,
    longRestDurationDelayMinutesDraft,
    longRestDurationMinutesDraft,
    longRestIntervalHoursDraft,
    longRestScheduledTimesDraft,
    longRestStartDelayMinutesDraft,
    persistSmartSession,
  ])

  const handleVerifyWorldPlayerLicense = useCallback(async () => {
    if (
      checkingLicense
      || typeof state?.playerId !== 'number'
      || !state?.world
    ) {
      return
    }

    setCheckingLicense(true)
    setError(null)

    try {
      const response = await chrome.runtime.sendMessage({
        extensionId: RELEASE_EXTENSION_ID,
        type: VERIFY_WORLD_PLAYER_LICENSE_MESSAGE_TYPE,
        world: state.world,
        playerId: state.playerId,
        targetTabId: state.tabId ?? null,
        targetWindowId: state.windowId ?? null,
      }) as PopupState

      if (!response?.ok) {
        throw new Error(response?.reason || 'Unable to verify license')
      }

      setState(response)
      setLicenseRetryTick(Date.now())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setCheckingLicense(false)
    }
  }, [checkingLicense, state])

  const isReady = state?.supported && state?.ready
  const hasPlayerIdentity = typeof state?.playerId === 'number'
  const playerEnabledByUserState = hasPlayerIdentity && typeof state?.enabledByUser === 'boolean'
    ? state.enabledByUser
    : null
  const isPlayerEnabledByUser = playerEnabledByUserState === true
  const isRuntimeRunning = (
    state?.active === true
    && state?.enabledByUser === true
    && state?.license?.allowedByLicense === true
  )
  const runtimeStatus = getRuntimeStatus({
    active: isRuntimeRunning,
    enabledByUser: state?.enabledByUser,
    hasPlayerIdentity,
    isNetError: state?.isNetError === true,
    isConnectServerError: state?.isConnectServerError === true,
  })
  const runtimeLabel = getRuntimeLabel(runtimeStatus)
  const runtimeTone = getRuntimeTone(runtimeStatus)
  const runtimeTooltip = getRuntimeTooltip(runtimeStatus)
  const canToggleEnabledByUser = hasPlayerIdentity && !savingEnabledByUser
  const isMdfScope = state?.t !== null
  const hasReconnectOption = hasPlayerIdentity && state?.license?.allowedByLicense === true
  const nextPostLicenseButtonAt = state?.nextPostLicenseButtonAt ?? null
  const canVerifyLicense = (
    (state?.license?.status === 'inactive' || state?.license?.status === 'session-expired')
    && hasPlayerIdentity
    && !checkingLicense
    && (
      typeof nextPostLicenseButtonAt !== 'number'
      || nextPostLicenseButtonAt <= licenseRetryTick
    )
  )
  const verifyLicenseTooltip = canVerifyLicense
    ? state?.license?.status === 'session-expired'
      ? 'Try to validate the session again now'
      : 'Check whether this player has an active license now'
    : state?.license?.status === 'inactive' || state?.license?.status === 'session-expired'
      ? `Available at ${formatRetryAt(nextPostLicenseButtonAt) || '--:--'}`
      : 'Available only when the player has no active license or an expired session'
  const showReconnectOption = hasPlayerIdentity
  const reconnectOnSessionExpiredState = showReconnectOption
    ? (isMdfScope ? false : state?.reconnectOnSessionExpired === true)
    : null
  const canToggleReconnectOnSessionExpired = (
    hasReconnectOption
    && !isMdfScope
    && !savingReconnectOnSessionExpired
  )
  const smartSessionState = state?.smartSession ?? createDefaultSmartSessionConfig()
  const hasSmartSessionOption = hasPlayerIdentity
  const canEditSmartSession = (
    hasSmartSessionOption
    && !savingSmartSession
  )
  const showSmartSessionConfigPage = popupView === 'smart-session' && hasSmartSessionOption
  const enabledByUserTooltip = !hasPlayerIdentity
    ? 'Waiting for player identification'
    : isPlayerEnabledByUser
      ? 'Turn off for this player'
      : 'Turn on for this player'
  const reconnectTooltip = !hasReconnectOption
    ? 'Available when the player has an active license'
    : isMdfScope
      ? 'Unavailable for MDF scopes'
    : reconnectOnSessionExpiredState === true
      ? 'Disable automatic reconnect when the session expires'
      : 'Enable automatic reconnect when the session expires'
  const shortBreakTooltip = !hasSmartSessionOption
    ? 'Waiting for player identification'
    : smartSessionState.shortBreak.enabled
      ? 'Disable smart short breaks'
      : 'Enable smart short breaks'
  const longRestTooltip = !hasSmartSessionOption
    ? 'Waiting for player identification'
    : smartSessionState.longRest.enabled
      ? 'Disable smart long rest'
      : 'Enable smart long rest'
  const smartSessionSummary = [
    smartSessionState.shortBreak.enabled
      ? `short every ${smartSessionState.shortBreak.everyMinutes}m for ${smartSessionState.shortBreak.durationMinutes}+${smartSessionState.shortBreak.delayMinutes}m`
      : 'short off',
    smartSessionState.longRest.enabled
      ? smartSessionState.longRest.mode === 'schedule'
        ? `long ${smartSessionState.longRest.scheduledTimes.join(', ')}`
        : `long every ${smartSessionState.longRest.intervalHours}h`
      : 'long off',
  ].join(' • ')
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
  const formattedUpdatedAt = formatUpdatedAt(state?.updatedAt)
  const formattedLicenseDueAt = formatDateTime(state?.licenseDueAt)
  const formattedTokenExpiresAt = formatDateTime(state?.tokenExpiresAt)
  const formattedLicenseRetryAt = formatRetryAt(nextPostLicenseButtonAt)
  const licenseTooltip = getLicenseTooltip({
    licenseStatus: state?.license?.status,
    formattedLicenseDueAt,
    formattedTokenExpiresAt,
    nextRetryAt: formattedLicenseRetryAt,
  })
  const licenseTooltipHtml = getLicenseTooltipHtml({
    licenseStatus: state?.license?.status,
    formattedLicenseDueAt,
    formattedTokenExpiresAt,
  })
  const featureItems: FeatureItem[] = FEATURE_LABELS.flatMap(([featureKey, label]) => {
    const feature = state?.features?.[featureKey]

    if (feature == null) {
      return []
    }

    return [{
      key: featureKey,
      label,
      tone: getFeatureTone(feature),
    }]
  })

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
        ) : showSmartSessionConfigPage ? (
          <Panel>
            <BotSection>
              <SettingRow>
                <SettingText>
                  <SettingTitle>Smart Session Management</SettingTitle>
                  <SettingDescription>
                    Configure short breaks and long rests without polluting the main popup view.
                  </SettingDescription>
                </SettingText>
                <SmartSettingButton
                  type="button"
                  onClick={() => {
                    setPopupView('main')
                  }}
                >
                  Back
                </SmartSettingButton>
              </SettingRow>

              <TechnicalMeta>
                <TechnicalMetaItem>
                  <strong>Scope:</strong> {getScopeLabel(state?.world, state?.t)}
                </TechnicalMetaItem>
                {typeof state?.playerId === 'number' ? (
                  <TechnicalMetaItem>
                    <strong>Player:</strong> #{state.playerId}
                  </TechnicalMetaItem>
                ) : null}
              </TechnicalMeta>

              <SmartSettingCard>
                <SmartSettingHeader>
                    <SettingText>
                      <SettingTitle>Smart Short Breaks</SettingTitle>
                      <SettingDescription>
                      Leaves the game every configured interval after returning, with a short delay window used on both exit and reconnect. If any execution is already due or will run within 1 minute, the exit is postponed by 1 minute.
                      </SettingDescription>
                    </SettingText>
                  <ToggleSwitch
                    $checked={smartSessionState.shortBreak.enabled}
                    $disabled={!canEditSmartSession}
                    data-popup-title={shortBreakTooltip}
                  >
                    <input
                      type="checkbox"
                      checked={smartSessionState.shortBreak.enabled === true}
                      disabled={!canEditSmartSession}
                      aria-label="Toggle smart short breaks"
                      onChange={() => { void handleShortBreakToggleChange() }}
                    />
                  </ToggleSwitch>
                </SmartSettingHeader>

                <SmartSettingInputs>
                  <SmartSettingField>
                    <SmartSettingFieldLabel>Every (min)</SmartSettingFieldLabel>
                    <SmartSettingInput
                      type="number"
                      min={MIN_SMART_SHORT_BREAK_EVERY_MINUTES}
                      max={MAX_SMART_SHORT_BREAK_EVERY_MINUTES}
                      step={1}
                      value={shortBreakEveryDraft}
                      disabled={!canEditSmartSession}
                      onChange={(event) => {
                        setShortBreakEveryDraft(event.currentTarget.value)
                      }}
                    />
                  </SmartSettingField>

                  <SmartSettingField>
                    <SmartSettingFieldLabel>Duration (min)</SmartSettingFieldLabel>
                    <SmartSettingInput
                      type="number"
                      min={MIN_SMART_SHORT_BREAK_DURATION_MINUTES}
                      max={MAX_SMART_SHORT_BREAK_DURATION_MINUTES}
                      step={1}
                      value={shortBreakDurationDraft}
                      disabled={!canEditSmartSession}
                      onChange={(event) => {
                        setShortBreakDurationDraft(event.currentTarget.value)
                      }}
                    />
                  </SmartSettingField>

                  <SmartSettingField>
                    <SmartSettingFieldLabel>Delay (min)</SmartSettingFieldLabel>
                    <SmartSettingInput
                      type="number"
                      min={MIN_SMART_SHORT_BREAK_DELAY_MINUTES}
                      max={MAX_SMART_SHORT_BREAK_DELAY_MINUTES}
                      step={1}
                      value={shortBreakDelayDraft}
                      disabled={!canEditSmartSession}
                      onChange={(event) => {
                        setShortBreakDelayDraft(event.currentTarget.value)
                      }}
                    />
                  </SmartSettingField>
                </SmartSettingInputs>

                <SmartSettingActions>
                  <SmartSettingButton
                    type="button"
                    disabled={!canEditSmartSession}
                    onClick={() => { void handleShortBreakSave() }}
                  >
                    Save
                  </SmartSettingButton>
                </SmartSettingActions>
              </SmartSettingCard>

              <SmartSettingCard>
                <SmartSettingHeader>
                    <SettingText>
                    <SettingTitle>Smart Long Rest</SettingTitle>
                    <SettingDescription>
                      Supports interval mode or a daily schedule list such as 08:00, 12:00 and 18:00. If a useful execution would happen during the rest window, the exit is postponed until after it.
                    </SettingDescription>
                  </SettingText>
                  <ToggleSwitch
                    $checked={smartSessionState.longRest.enabled}
                    $disabled={!canEditSmartSession}
                    data-popup-title={longRestTooltip}
                  >
                    <input
                      type="checkbox"
                      checked={smartSessionState.longRest.enabled === true}
                      disabled={!canEditSmartSession}
                      aria-label="Toggle scheduled long rest"
                      onChange={() => { void handleLongRestToggleChange() }}
                    />
                  </ToggleSwitch>
                </SmartSettingHeader>

                <SmartSettingInputs>
                  <SmartSettingField>
                    <SmartSettingFieldLabel>Mode</SmartSettingFieldLabel>
                    <SmartSettingSelect
                      value={longRestModeDraft}
                      disabled={!canEditSmartSession}
                      onChange={(event) => {
                        const nextMode = parseSmartSessionLongRestMode(event.currentTarget.value)

                        if (nextMode) {
                          setLongRestModeDraft(nextMode)
                        }
                      }}
                    >
                      <option value="interval">Interval</option>
                      <option value="schedule">Schedule list</option>
                    </SmartSettingSelect>
                  </SmartSettingField>

                  <SmartSettingField>
                    <SmartSettingFieldLabel>Duration (min)</SmartSettingFieldLabel>
                    <SmartSettingInput
                      type="number"
                      min={MIN_SMART_LONG_REST_DURATION_MINUTES}
                      step={1}
                      value={longRestDurationMinutesDraft}
                      disabled={!canEditSmartSession}
                      onChange={(event) => {
                        setLongRestDurationMinutesDraft(event.currentTarget.value)
                      }}
                    />
                  </SmartSettingField>

                  <SmartSettingField>
                    <SmartSettingFieldLabel>Duration delay (1-5 min)</SmartSettingFieldLabel>
                    <SmartSettingInput
                      type="number"
                      min={MIN_SMART_LONG_REST_DURATION_DELAY_MINUTES}
                      max={MAX_SMART_LONG_REST_DURATION_DELAY_MINUTES}
                      step={1}
                      value={longRestDurationDelayMinutesDraft}
                      disabled={!canEditSmartSession}
                      onChange={(event) => {
                        setLongRestDurationDelayMinutesDraft(event.currentTarget.value)
                      }}
                    />
                  </SmartSettingField>

                  <SmartSettingField>
                    <SmartSettingFieldLabel>Start delay (5-10 min)</SmartSettingFieldLabel>
                    <SmartSettingInput
                      type="number"
                      min={MIN_SMART_LONG_REST_START_DELAY_MINUTES}
                      max={MAX_SMART_LONG_REST_START_DELAY_MINUTES}
                      step={1}
                      value={longRestStartDelayMinutesDraft}
                      disabled={!canEditSmartSession}
                      onChange={(event) => {
                        setLongRestStartDelayMinutesDraft(event.currentTarget.value)
                      }}
                    />
                  </SmartSettingField>

                  {longRestModeDraft === 'interval' ? (
                    <SmartSettingField>
                      <SmartSettingFieldLabel>Every (hours)</SmartSettingFieldLabel>
                      <SmartSettingInput
                        type="number"
                        min={1}
                        max={MAX_SMART_LONG_REST_INTERVAL_HOURS}
                        step={1}
                        value={longRestIntervalHoursDraft}
                        disabled={!canEditSmartSession}
                        onChange={(event) => {
                          setLongRestIntervalHoursDraft(event.currentTarget.value)
                        }}
                      />
                    </SmartSettingField>
                  ) : (
                    <SmartSettingField>
                      <SmartSettingFieldLabel>Daily times</SmartSettingFieldLabel>
                      <SmartSettingInput
                        type="text"
                        value={longRestScheduledTimesDraft}
                        disabled={!canEditSmartSession}
                        onChange={(event) => {
                          setLongRestScheduledTimesDraft(event.currentTarget.value)
                        }}
                      />
                    </SmartSettingField>
                  )}
                </SmartSettingInputs>

                <SmartSettingActions>
                  <SmartSettingButton
                    type="button"
                    disabled={!canEditSmartSession}
                    onClick={() => { void handleLongRestSave() }}
                  >
                    Save
                  </SmartSettingButton>
                </SmartSettingActions>
              </SmartSettingCard>
            </BotSection>
          </Panel>
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
                    <Pill $tone={runtimeTone} data-popup-title={runtimeTooltip}>
                      {runtimeLabel}
                    </Pill>
                    {state?.isBotProtected ? (
                      <Pill $tone="danger">
                        hCaptcha identified
                      </Pill>
                    ) : null}
                    <LicenseBadge>
                      <Pill
                        $tone={getLicenseTone(state?.license?.status)}
                        data-popup-title={licenseTooltip}
                        data-popup-html={licenseTooltipHtml || undefined}
                      >
                        {getLicenseText(state?.license?.status)}
                      </Pill>
                      {state?.license?.status === 'inactive' || state?.license?.status === 'session-expired' ? (
                        <LicenseRefreshButton
                          type="button"
                          $tone={getLicenseTone(state?.license?.status)}
                          disabled={!canVerifyLicense}
                          data-popup-title={verifyLicenseTooltip}
                          aria-label="Verify player license"
                          onClick={() => { void handleVerifyWorldPlayerLicense() }}
                        >
                          <RefreshSvg />
                        </LicenseRefreshButton>
                      ) : null}
                    </LicenseBadge>
                    {state?.isTryConfirm ? (
                      <Pill $tone="danger">Try Confirm</Pill>
                    ) : null}
                  </Pills>
                </UserMeta>
                <UserSwitchSlot>
                  <PlayerEnabledByUserSwitch
                    $checked={playerEnabledByUserState}
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

              {showReconnectOption ? (
                <>
                  <SettingRow>
                    <SettingText>
                      <SettingTitle>Reconnect on session expired</SettingTitle>
                      <SettingDescription>
                        {isMdfScope
                          ? 'Disabled for MDF scopes.'
                          : 'Waits 15-30s and reconnects automatically when no manual login input is required.'}
                      </SettingDescription>
                    </SettingText>
                    <ToggleSwitch
                      $checked={reconnectOnSessionExpiredState}
                      $disabled={!canToggleReconnectOnSessionExpired}
                      data-popup-title={reconnectTooltip}
                    >
                      <input
                        type="checkbox"
                        checked={reconnectOnSessionExpiredState === true}
                        disabled={!canToggleReconnectOnSessionExpired}
                        aria-label="Toggle reconnect on session expired"
                        onChange={() => { void handleReconnectOnSessionExpiredChange() }}
                      />
                    </ToggleSwitch>
                  </SettingRow>

                  <SettingRow>
                    <SettingText>
                      <SettingTitle>Smart Session Management</SettingTitle>
                      <SettingDescription>
                        {smartSessionSummary}. Open the dedicated config page to edit rules and schedules.
                      </SettingDescription>
                    </SettingText>
                    <SmartSettingButton
                      type="button"
                      disabled={!hasSmartSessionOption}
                      onClick={() => {
                        setPopupView('smart-session')
                      }}
                    >
                      Configure
                    </SmartSettingButton>
                  </SettingRow>
                </>
              ) : null}
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
                <>
                  <Grid>
                    {playerMetrics.map((metric) => (
                      <Cell key={metric.key}>
                        <Label>{metric.label}</Label>
                        <Value>{metric.value}</Value>
                      </Cell>
                    ))}
                  </Grid>

                  {formattedUpdatedAt ? (
                    <UpdateMark>
                      <UpdateDot aria-hidden="true" />
                      <span>Updated {formattedUpdatedAt}</span>
                      <UpdateTrack
                        key={updatePulseTick > 0 ? `pulse-${updatePulseTick}` : 'steady'}
                        $animate={updatePulseTick > 0}
                        aria-hidden="true"
                      />
                    </UpdateMark>
                  ) : null}
                </>
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
            {runtimeStatus === 'off'
              ? 'The bot is turned off for this player.'
              : runtimeStatus === 'net-error'
              ? 'The bot is blocked because the user internet connection appears to be unavailable.'
              : runtimeStatus === 'connect-error'
              ? "The bot is blocked because the Let's GO server or CDN could not be reached."
              : state?.license?.status === 'session-expired'
              ? 'The bot is stopped until the session can be validated again.'
              : isRuntimeRunning
              ? 'The bot is marked to run on this tab.'
              : 'The popup follows the active Tribal Wars tab, even when it is not executing there.'}
          </Hint>
        </Footer>
      </Shell>
    </Root>
  )
}
