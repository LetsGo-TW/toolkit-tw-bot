const express = require('express')
const router = express.Router()
const { default: axios } = require('axios')
const authMiddleware = require('../middlewares/auth.middleware')

const { KEY_2CAPTCHA, SOFT_ID } = process.env

router.use(authMiddleware)

router.post('/', async(req, res) => {
  const body = req.body

  const { origin_url: ORIGIN_URL, site_key: SITE_KEY } = body

  console.log({ ORIGIN_URL, SITE_KEY, KEY_2CAPTCHA, SOFT_ID })

  if (!ORIGIN_URL || !SITE_KEY || !KEY_2CAPTCHA || !SOFT_ID) {
    return res.status(400).send({ message: 'Bad request - Insufficient or missing parameters' })
  }

  try {
    const { data } = await axios(
      `https://2captcha.com/in.php?key=${
        KEY_2CAPTCHA
      }&method=hcaptcha&sitekey=${
        SITE_KEY
      }&pageurl=${
        ORIGIN_URL
      }&json=1&header_acao=1&soft_id=${
        SOFT_ID
      }`, {
        method: 'GET',
      }
    )

    console.log(data)

    if (!data) {
      return res.status(404).send({ message: 'Not found'})
    }

    return res.status(200).send(data)
  } catch (error) {
    console.log(error)

    return res.status(404).send({ message: error.message || 'Not found' })
  }
})

router.get('/:CAPTCHA_ID', async(req, res) => {
  const { CAPTCHA_ID } = req.params

  console.log({ CAPTCHA_ID, KEY_2CAPTCHA })

  if (!CAPTCHA_ID || !KEY_2CAPTCHA) {
    return res.status(400).send({ message: 'Bad request - Insufficient or missing parameters' })
  }

  try {
    const { data } = await axios(
      `https://2captcha.com/res.php?key=${
          KEY_2CAPTCHA
        }&action=get&id=${
          CAPTCHA_ID
        }&json=1`, {
          method: 'GET'
        }
    )

    console.log(data)

    if (!data) {
      return res.status(404).send({ message: 'Not found'})
    }

    return res.status(200).send(data)
  } catch (error) {
    return res.status(404).send({ message: error.message || 'Not Found' })
  }
})

module.exports = app => app.use('/api-solver', router)
