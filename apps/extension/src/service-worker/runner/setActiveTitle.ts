export const setActiveTitle = (
  isActive: boolean = false,
  isBotProtect: boolean = false,
  isTryConfirm: boolean = false,
  isMdf: boolean = false,
  isLicense: boolean = true,
  isLicenceExpires: boolean = false
) => {
  const emojis = ['🚫', '🔴', '☢️', '🟢', '🟡', '[🚫]', '[🔴]', '[☢️]', '[🟢]', '[🟡]']
  let emoji
  let title = document.title

  emojis.forEach(e => {
    if (title.includes(e)) {
      title = title.replace(`${e} `, '')
    }
  })

  if (!isActive) {
    document.title = title
    return
  }

  emoji = isLicenceExpires ? '🟡' : '🟢'
  if (isTryConfirm) emoji = '☢️'
  if (isBotProtect) emoji = '🚫'
  if (!isLicense) emoji = '🔴'
  if (isMdf) emoji = `[${emoji}]`

  document.title = `${emoji} ${title}`
}
