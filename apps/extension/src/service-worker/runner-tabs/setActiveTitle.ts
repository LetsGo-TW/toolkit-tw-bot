type SetActiveTitleParams = {
  isRunningTab?: boolean
  enabledByUser?: boolean
  isBotProtected?: boolean
  isTryConfirm?: boolean
  isMdfScope?: boolean
  isAllowedByLicense?: boolean
  isLicenseExpiring?: boolean
  isIntro?: boolean
}

export const setActiveTitle = ({
  isRunningTab = false,
  enabledByUser = true,
  isBotProtected = false,
  isTryConfirm = false,
  isMdfScope = false,
  isAllowedByLicense = true,
  isLicenseExpiring = false,
  isIntro = false,
}: SetActiveTitleParams = {}) => {
  const emojis = ['🚫', '⛔', '🛑', '☢️', '🟢', '🟡', '⌛', '[🚫]', '[⛔]', '[🛑]', '[☢️]', '[🟢]', '[🟡]', '[⌛]']
  let emoji: string | undefined
  let title = document.title

  emojis.forEach((value) => {
    if (title.includes(value)) {
      title = title.replace(`${value} `, '')
    }
  })
  if (!isRunningTab) {
    document.title = title;
    return;
  }
  if (isIntro) {
    emoji = '⌛';
    if (isMdfScope) emoji = `[${emoji}]`;
    document.title = `${emoji} ${title}`;
    return
  }
  emoji = isLicenseExpiring ? '🟡' : '🟢';
  if (isTryConfirm) emoji = '☢️';
  if (isBotProtected) emoji = '🚫';
  if (!enabledByUser) emoji = '🛑';
  if (!isAllowedByLicense) emoji = '⛔';
  if (isMdfScope) emoji = `[${emoji}]`;

  document.title = `${emoji} ${title}`;
}
