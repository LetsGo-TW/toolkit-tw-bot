const jwt = require('jsonwebtoken')
const verifyDue = require('./verify.due')

const JWT_SECRET = process.env.JWT_SECRET

module.exports = (req, res) => {
  const { token } = req.params

  // console.log(token, req.params)

  if (!token) {
    return res.status(400).send({ error: 'Bad request - Authorization provided not found'})
  }

  jwt.verify(token, JWT_SECRET, (error, decoded) => {
    if (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).send({ error: 'Unauthorized - Token expired'})
      } else {
        return res.status(406).send({ error: 'Unauthorized - Invalid token'})
      }
    }

    if (!decoded.due || !decoded.id) {
      return res.status(406).send({ error: 'Unauthorized - Invalid token'})
    }

    if (!verifyDue(decoded.due)) {
      return res.status(403).send({ error: 'Forbidden - Licence expired'})
    }

    return
  })
}
