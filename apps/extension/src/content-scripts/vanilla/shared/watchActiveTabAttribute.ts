const ACTIVE_TAB_ATTRIBUTE = 'data-activetab'

export function isActiveTabAttributeEnabled(
  element: Element | null = document.documentElement,
) {
  return element?.getAttribute(ACTIVE_TAB_ATTRIBUTE) === 'true'
}

export function watchActiveTabAttribute(
  onChange: (isActive: boolean, previousIsActive: boolean | null) => void,
) {
  const element = document.documentElement
  let currentIsActive = isActiveTabAttributeEnabled(element)

  onChange(currentIsActive, null)

  if (!element) {
    return () => {}
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (
        mutation.type !== 'attributes'
        || mutation.attributeName !== ACTIVE_TAB_ATTRIBUTE
      ) {
        continue
      }

      const nextIsActive = isActiveTabAttributeEnabled(element)

      if (nextIsActive === currentIsActive) {
        return
      }

      const previousIsActive = currentIsActive
      currentIsActive = nextIsActive

      onChange(nextIsActive, previousIsActive)
      return
    }
  })

  observer.observe(element, {
    attributes: true,
    attributeFilter: [ACTIVE_TAB_ATTRIBUTE],
  })

  return () => observer.disconnect()
}
