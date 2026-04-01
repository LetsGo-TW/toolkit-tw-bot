function searchPlayerImageUrl(doc = document) {
  return Array
    .from(doc?.querySelectorAll?.('#content_value table img') || [])
    .map((entry) => entry?.src)
    .find((src) => src?.includes('userimage'))
}

module.exports = searchPlayerImageUrl
