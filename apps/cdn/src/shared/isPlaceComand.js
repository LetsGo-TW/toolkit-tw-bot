const isPlaceCommand = (html = document) => {
  const commandDataForm = html.querySelector("#command-data-form")
  const commandTarget = html.querySelector("#command_target")
  if (!commandDataForm || !commandTarget) return false
  return true
}

export { isPlaceCommand }
