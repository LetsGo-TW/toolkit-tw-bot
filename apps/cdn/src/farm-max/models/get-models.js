const getModels = (html = document) => {
  const forms = Array.from(html.querySelectorAll("#content_value form")).filter(form => form.action.includes('action=edit_all'))
  if (!forms) return []

  const names = Array.from(html.querySelectorAll("#farm_units th img")).map(img => img.src.match(/unit_([a-z]{1,})\.*/)[1])
  const models = Array.from(forms[0].querySelectorAll('tr'))
    .filter(tr => tr.querySelector('input[type=text]')).reduce((arr, tr, i) => {
      const name = i === 0 ? 'A' : 'B'
      const id = Number(tr.querySelector('input[type=hidden]').value)
      const units = Array.from(tr.querySelectorAll('input[type=text]')).map(input => Number(input.value))
      arr.push({id, name, units})
      return arr
    }, [])
  const C = {
    name: 'C',
    units: Array.from(html.querySelector("#farm_units").querySelectorAll('input')).reduce((values, input, i) => {
      if (names[i] === 'spy') {
        values.push(false, input.checked)
      } else {
        values.push(input.checked)
      }
      return values
    }, [])
  }

  models.push(C)

  console.log('MODELS', models)

  return models
}
export { getModels }
