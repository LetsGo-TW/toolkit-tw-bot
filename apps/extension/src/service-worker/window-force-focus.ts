type WindowForceFocusResult = {
  ok: boolean
  activetab: boolean
  focusedWindow: boolean
  windowState?: chrome.windows.Window['state']
  restoredFromMinimized: boolean
  error?: string
}

export async function windowForceFocus(
  windowId: number | undefined,
  tabId: number | undefined,
): Promise<WindowForceFocusResult> {
  if (!windowId) {
    return {
      ok: false,
      activetab: false,
      focusedWindow: false,
      restoredFromMinimized: false,
      error: 'Missing windowId',
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 100))

  try {
    const currentWindow = await chrome.windows.get(windowId)
    const restoredFromMinimized = currentWindow.state === 'minimized'

    if (typeof tabId === 'number') {
      await chrome.tabs.update(tabId, { active: true })
    }

    const updatedWindow = await chrome.windows.update(
      windowId,
      restoredFromMinimized
        ? { focused: true, state: chrome.windows.WindowState.NORMAL }
        : { focused: true },
    )

    const updatedTab = typeof tabId === 'number'
      ? await chrome.tabs.get(tabId)
      : null

    return {
      ok: true,
      activetab: updatedTab?.active ?? true,
      focusedWindow: updatedWindow.focused === true,
      windowState: updatedWindow.state,
      restoredFromMinimized,
    }
  } catch (error) {
    return {
      ok: false,
      activetab: false,
      focusedWindow: false,
      restoredFromMinimized: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
