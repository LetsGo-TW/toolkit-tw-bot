// api/middlewares/force-https.middleware.js
module.exports = (req, res, next) => {
  const isProd = process.env.NODE_ENV === "production";

  // no Heroku, quando chega via HTTPS, vem esse header:
  // x-forwarded-proto: "https"
  if (isProd && req.headers["x-forwarded-proto"] !== "https") {
    const host = req.headers.host;
    const url = req.url || "";
    return res.redirect(`https://${host}${url}`);
  }

  next();
}
