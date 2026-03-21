const express = require('express')
const path = require('path')
const authParamsMiddleware = require('../middlewares/auth.params.middleware')
const router = express.Router()

router.get('/:token/*', (req, res) => {
  try {
    const { '0': file } = req.params

    authParamsMiddleware(req, res)

    // Hotfix: evita cliente preso em chunk/script antigo após deploy.
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    res.set('Pragma', 'no-cache')
    res.set('Expires', '0')
    res.set('Surrogate-Control', 'no-store')

    return res.sendFile(
      path.join(__dirname, `../${file}` )
    )
  } catch (error) {
    if (error.message && error.cause) {
      return res.status(error.cause).send({ message: error.message })
    }

    return res.status(404).send(error)
  }
})

module.exports = app => app.use('/api', router)
