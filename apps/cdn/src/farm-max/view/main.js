// eslint-disable-next-line no-undef
__webpack_nonce__ = 'c29tZSBjb29sIHN0cmluZyB3aWxsIHBvcCB1cCAxMjM=';

import view from ".";

export default async() => {
  const url = new URL(window.location.href)
  if (url.searchParams.has('intro')) return
  if (document.querySelector("#go-farm-form-config")) return
  
  await view.render()
}
