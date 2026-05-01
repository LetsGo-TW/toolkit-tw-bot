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
    running,
    mountTarget = null
  }) {
  const contentContainer = mountTarget instanceof HTMLElement
    ? mountTarget
    : document.querySelector("#contentContainer")
  if (!contentContainer) return { destroy() {} }

  const DEFAULT_BOT_ICON_URL = `chrome-extension://${extensionId}/icons/ico.green.128.png`;
  
  const save = (value) => {
    localStorage.setItem(key, value)
  }

  const insert = () => {
    const mapConteiner = document.createElement('div')
    mapConteiner.id = "go__map_container"
    mapConteiner.className = mountTarget instanceof HTMLElement ? '' : 'float_left'
    mapConteiner.style.margin = mountTarget instanceof HTMLElement ? '0' : '10px'
    mapConteiner.innerHTML = searchTextHtml
    if (mountTarget instanceof HTMLElement) {
      contentContainer.replaceChildren(mapConteiner)
    } else {
      contentContainer.prepend(mapConteiner)
    }
    const logo = document.createElement('img')
    logo.id = 'go-logo'
    logo.src = DEFAULT_BOT_ICON_URL
    logo.width = 24
    logo.height = 24
    document.querySelector('.go-search-barbarians-title')?.insertAdjacentElement('afterbegin', logo)
  }

  const mounted = contentContainer.querySelector?.("#go__map_container") || document.querySelector("#go__map_container")
  if (!mounted) {
    insert()
  }

  const goMapChooserSelect = document.querySelector("#go__map_chooser_select")
  const goStartSearch = document.querySelector("#go__start_search")
  const goStopSearch = document.querySelector("#go__stop_search")
  const goFinishSearch = document.querySelector("#go__finish_search")

  const showStartState = () => {
    goStartSearch?.classList.add('show')
    goStopSearch?.classList.remove('show')
    goFinishSearch?.classList.remove('show')
    if (goStopSearch) goStopSearch.textContent = 'Stop Search'
  }

  const showRunningState = () => {
    goStartSearch?.classList.remove('show')
    goStopSearch?.classList.add('show')
    goFinishSearch?.classList.add('show')
    if (goStopSearch) {
      goStopSearch.textContent = running?.is_paused?.('mapSearch')
        ? 'Continuar'
        : 'Stop Search'
    }
  }

  const syncSearchButtonsState = () => {
    if (running?.is_active?.('mapSearch')) {
      showRunningState()
      return
    }
    showStartState()
  }

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
      showStartState()
      return
    }
    if (id === 'go__start_search') {
      // Verifica se outro script já está rodando antes de iniciar.
      if (running.is_active({ exclude: ['mapSearch'] })) {
        printMessage.error('Outro script já está em execução. Por favor, aguarde.', 4000)
        return
      }

      showRunningState()

      try {
        await spyBarbs()
      } finally {
        showStartState()
      }
    }
  }

  goStartSearch?.addEventListener('click', onClickSearch)
  goStopSearch?.addEventListener('click', onClickSearch)
  goFinishSearch?.addEventListener('click', onClickSearch)
  syncSearchButtonsState()

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
