module.exports = (due) => {
  const dayNow = Number(parseInt(Date.now() / (3600 * 1000)))

  const dayDue = Number(parseInt(due / 3600))

  // console.log({ dayNow, dayDue })

  if (dayNow > dayDue) {
    return false
  }

  return true
}
