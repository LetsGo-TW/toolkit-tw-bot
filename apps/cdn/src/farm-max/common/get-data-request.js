import { makeAjaxHeadersGetDoc } from "@toolkit-tw-bot/browser";

function getDataRequest(url, urlParams = {}) {
  const newUrl = new URL(url, window.location.origin)
  Object.entries({
    ...urlParams,
  }).forEach(([key, value]) => {
    newUrl.searchParams.set(key, String(value))
  })
  const headers = makeAjaxHeadersGetDoc()

  const dataRequest = {
    url: newUrl.toString(),
    init: {
      method: 'GET',
      headers,
      credentials: "include",
      referrerPolicy: "origin",
      cache: "no-store",
    }
  };

  return dataRequest
}

export { getDataRequest }
