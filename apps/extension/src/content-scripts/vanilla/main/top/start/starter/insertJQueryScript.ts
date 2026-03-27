import $_ from 'jquery';

const insertScript = async (url: string) => {
  $_.ajaxSetup({
    cache: true,
  })

  return new Promise((resolve, reject) => {
    insert()

    function insert() {
      $_.getScript(url)
        // eslint-disable-next-line no-unused-vars
        .done(() => {
          resolve({ ok: true })
        })
        // eslint-disable-next-line no-unused-vars
        .fail(() => {
          reject(new Error(`Failed to load script: ${url}`, { cause: 404 }))
        })
    }

  })
}
