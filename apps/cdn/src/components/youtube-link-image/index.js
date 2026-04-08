import View from './View'
import data from './index.json';
import { printMessage } from '../printMessage'
import { getGameData } from '@toolkit-tw-bot/document';

export default (href, callback) => {
  const gameData = getGameData()
  if (!gameData) return
  const lang = new Intl.Locale(gameData.locale.split('_').join('-')).baseName.includes('pt') ? 'br' : 'en'

  return View.create(href, callback || printMessage.error, data[lang])
}
