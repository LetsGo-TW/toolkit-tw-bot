const jwt = require('jsonwebtoken')
const verifyDue = require('./verify.due')

const JWT_SECRET = process.env.JWT_SECRET

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization

  if (!authHeader) {
    return res.status(400).send({ error: 'Bad request - Authorization provided not found'})
  }

  const parts = authHeader.split(' ')

  if (parts.length !== 2) {
    return res.status(400).send({ error: 'Bad request - Authorization scheme not found'})
  }

  const [ scheme, token ] = parts

  // console.log({authHeader, scheme, token })

  if (!/^Bearer$/i.test(scheme)) {
    return res.status(400).send({ error: 'Bad request - Authorization scheme malformatted'})
  }

  jwt.verify(token, JWT_SECRET, (error, decoded) => {
    if (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).send({ error: 'Unauthorized - Token expired'})
      } else {
        return res.status(406).send({ error: 'Unauthorized - Invalid token'})
      }
    }

    // console.log(decoded)

    if (!decoded.due || !decoded.id) {
      return res.status(406).send({ error: 'Unauthorized - Invalid token'})
    }

    if (!verifyDue(decoded.due)) {
      return res.status(403).send({ error: 'Forbidden - Licence expired'})
    }

    return next()
  })
}
