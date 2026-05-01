const isCurrentScreen = screen => {
  const url = new URL(window.location.href)
  if (url.searchParams.get('screen') === screen) return true
  return false
}

export {
  isCurrentScreen
}
