// api/middlewares/cors.middleware.js
module.exports = (req, callback) => {
  const allowlist = [
    'tribalwars.com.br',
    'die-staemme.de',
    'staemme.ch',
    'tribalwars.net',
    'tribalwars.nl',
    'plemiona.pl',
    'tribalwars.com.pt',
    'divokekmeny.cz',
    'triburile.ro',
    'voynaplemyon.com',
    'fyletikesmaxes.gr',
    'divoke-kmene.sk',
    'klanhaboru.hu',
    'tribals.it',
    'klanlar.org',
    'guerretribale.fr',
    'guerrastribales.es',
    'tribalwars.ae',
    'tribalwars.co.uk',
    'tribalwars.works',
    'tribalwars.us',
    'chrome-extension'
  ]

  const corsOptions = {
    origin: allowlist.find(e => req.header('Origin').indexOf(e) !== -1)
      ? true
      : false
  }

  callback(null, corsOptions)
}
