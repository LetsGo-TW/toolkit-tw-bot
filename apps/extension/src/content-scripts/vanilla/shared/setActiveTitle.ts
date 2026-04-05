export type SetActiveTitleParams = {
  isRunningTab?: boolean
  enabledByUser?: boolean
  isReconnectEnabled?: boolean
  isReconnectState?: boolean
  isBotProtected?: boolean
  isNetError?: boolean
  isTryConfirm?: boolean
  isMdfScope?: boolean
  isAllowedByLicense?: boolean
  isLicenseExpiring?: boolean
  isIntro?: boolean
}

export function setActiveTitle({
  isRunningTab = false,
  enabledByUser = true,
  isReconnectEnabled = true,
  isReconnectState = false,
  isAllowedByLicense = true,
  isLicenseExpiring = false,
  isIntro = false,
  isBotProtected = false,
  isNetError = false,
  isTryConfirm = false,
  isMdfScope = false,
}: SetActiveTitleParams = {}) {
  const emojis = ['🚫', '⛔', '🛑', '☢️', '🟢', '🟡', '♻️', '📡', '[🚫]', '[⛔]', '[🛑]', '[☢️]', '[🟢]', '[🟡]', '[♻️]', '[📡]']
  let emoji: string | undefined
  let title = document.title

  emojis.forEach((value) => {
    if (title.includes(value)) {
      title = title.replace(`${value} `, '')
    }
  })

  if (!isRunningTab) {
    document.title = title
    return
  }

  if (isReconnectState) {
    emoji = '♻️'
    if (!enabledByUser || !isReconnectEnabled) emoji = '🛑'
    if (!isAllowedByLicense) emoji = '⛔'
    if (isMdfScope) emoji = `[${emoji}]`
    document.title = `${emoji} ${title}`
    return
  }

  if (isIntro) {
    emoji = '♻️'
    if (isMdfScope) emoji = `[${emoji}]`
    document.title = `${emoji} ${title}`
    return
  }

  emoji = isLicenseExpiring ? '🟡' : '🟢'
  if (isTryConfirm) emoji = '☢️'
  if (isNetError) emoji = '📡'
  if (isBotProtected) emoji = '🚫'
  if (!enabledByUser) emoji = '🛑'
  if (!isAllowedByLicense) emoji = '⛔'
  if (isMdfScope) emoji = `[${emoji}]`

  document.title = `${emoji} ${title}`
}
