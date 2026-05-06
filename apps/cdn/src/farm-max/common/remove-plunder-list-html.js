const removeFirstTrPlunderList = (html = document) => {
  html.querySelectorAll("#plunder_list tr")[0].remove()
}

export { removeFirstTrPlunderList }
