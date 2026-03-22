const QRCode = require("qrcode");

const DEFAULT_QR_OPTIONS = Object.freeze({
  type: "png",
  width: 320,
  margin: 2,
  errorCorrectionLevel: "M",
});

async function generateQrCodePngBuffer(text, options = {}) {
  return QRCode.toBuffer(String(text), {
    ...DEFAULT_QR_OPTIONS,
    ...options,
    type: "png",
  });
}

async function generateQrCodeDataUrl(text, options = {}) {
  return QRCode.toDataURL(String(text), {
    ...DEFAULT_QR_OPTIONS,
    ...options,
    type: "png",
  });
}

module.exports = {
  generateQrCodeDataUrl,
  generateQrCodePngBuffer,
};
