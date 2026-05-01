import './style.css'
import searchTextHtml from './index.html'
import { printMessage } from '../../../components/printMessage'
import { extensionId } from '@toolkit-tw-bot/release'

export function searchBarbariansView({
    mapChooseSelect,
    resizeMap,
    key,
    spyBarbs,
    controller,
    running
  }) {
  const contentContainer = document.querySelector("#contentContainer")
  if (!contentContainer) return

  const DEFAULT_BOT_ICON_URL = `chrome-extension://${extensionId}/icons/ico.green.128.png`;
  
  const save = (value) => {
    localStorage.setItem(key, value)
  }

  const insert = () => {
    const mapConteiner = document.createElement('div')
    contentContainer.prepend(mapConteiner)
    mapConteiner.id = "go__map_container"
    mapConteiner.className = "float_left"
    mapConteiner.style.margin = "10px"
    mapConteiner.innerHTML = searchTextHtml
    const logo = document.createElement('img')
    logo.id = 'go-logo'
    logo.src = DEFAULT_BOT_ICON_URL
    logo.width = 24
    logo.height = 24
    document.querySelector('.go-search-barbarians-title')?.insertAdjacentElement('afterbegin', logo)
  }

  const mounted = document.querySelector("#go__map_container")
  if (!mounted) {
    insert()
  }

  const goMapChooserSelect = document.querySelector("#go__map_chooser_select")
  const goStartSearch = document.querySelector("#go__start_search")
  const goStopSearch = document.querySelector("#go__stop_search")
  const goFinishSearch = document.querySelector("#go__finish_search")

  const onChangeResize = (e) => {
    const { value, id } = e.target
    if (!value) return
    save(value)
    if (id !== 'go__map_chooser_select') {
      goMapChooserSelect.value = value;
      return;
    }
    if (mapChooseSelect) {
      mapChooseSelect.value = value;
    }
  }

  goMapChooserSelect.addEventListener('change', onChangeResize)
  mapChooseSelect?.addEventListener('change', onChangeResize)
  goMapChooserSelect.value = resizeMap


  const onClickSearch = async (e) => {
    const id = e.currentTarget?.id
    const setStart = () => {
      goStopSearch?.classList.remove('show')
      goStopSearch?.removeEventListener('click', onClickSearch)
      goFinishSearch?.classList.remove('show')
      goFinishSearch?.removeEventListener('click', onClickSearch)
      goStartSearch?.classList.add('show')
      goStartSearch?.addEventListener('click', onClickSearch)
    }

    if (id === 'go__stop_search') {
      e.preventDefault()
      running.togglePause('mapSearch')
      if (running.is_paused('mapSearch')) {
        e.currentTarget.textContent = 'Continuar'
        printMessage.info('Envios pausados.', 2000)
      } else {
        e.currentTarget.textContent = 'Stop Search'
        printMessage.info('Continuando envios...', 2000)
      }
      return
    }

    if (id === 'go__finish_search') {
      running?.remove('mapSearch')
      controller?.abort('stop')
      setStart()
      return
    }
    if (id === 'go__start_search') {
      // Verifica se outro script já está rodando antes de iniciar.
      if (running.is_active({ exclude: ['mapSearch'] })) {
        printMessage.error('Outro script já está em execução. Por favor, aguarde.', 4000)
        return
      }

      goStartSearch?.classList.remove('show')
      goStartSearch?.removeEventListener('click', onClickSearch)
      goStopSearch?.classList.add('show')
      goStopSearch?.addEventListener('click', onClickSearch)
      goStopSearch.textContent = 'Stop Search'
      goFinishSearch?.classList.add('show')
      goFinishSearch?.addEventListener('click', onClickSearch)

      try {
        await spyBarbs()
      } finally {
        setStart()
      }
    }
  }

  goStartSearch.addEventListener('click', onClickSearch)

  const destroy = () => {
    controller?.abort('destroy')
    running?.remove('mapSearch')
    mapChooseSelect?.removeEventListener('change', onChangeResize)
    goMapChooserSelect?.removeEventListener('change', onChangeResize)
    goStartSearch?.removeEventListener('click', onClickSearch)
    goStopSearch?.removeEventListener('click', onClickSearch)
    goFinishSearch?.removeEventListener('click', onClickSearch)
  }

  return { destroy }
}
