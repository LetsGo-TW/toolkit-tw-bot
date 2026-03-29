import $_ from 'jquery';

const insertScript = async (url: string): Promise<void> => {
  $_.ajaxSetup({
    cache: true,
  })

  return new Promise<void>((resolve, reject) => {
    insert()

    function insert() {
      $_.getScript(url)
        .done(() => {
          resolve()
        })
        .fail(() => {
          reject(new Error(`Failed to load script: ${url}`, { cause: 404 }))
        })
    }
  })
}

export default insertScript
