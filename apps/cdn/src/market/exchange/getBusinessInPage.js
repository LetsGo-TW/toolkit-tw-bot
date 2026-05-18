function getBusinessInPage(doc=document, type="entry") {
  const tablesStatusBar = Array.from(doc.querySelectorAll('#market_status_bar table'))
  const business = {}
  if (tablesStatusBar.length > 1) {
    const thNodes =  Array.from(tablesStatusBar[1].querySelectorAll("th"))
    if (thNodes[type === "entry" ? 0 : 1 ]) {
      const resourcesValues = Array.from(thNodes[type === "entry" ? 0 : 1].querySelectorAll("span.nowrap")).map(e =>  e.children[0].classList[2])
      if (thNodes[type == "entry" ? 0 : 1].querySelector("span.premium") ) resourcesValues.push("premium")
      const values = thNodes[type === "entry" ? 0 : 1].textContent.split(" ").filter(e => e * 1 > 0)
      resourcesValues.forEach((resource, i) => {
        return business[resource] = values && values.length && values[i] ? values[i].replace(".","") * 1 : 0
      })
    }
  }
  return business
}

export { getBusinessInPage }
