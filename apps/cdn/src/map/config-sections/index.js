import { getGameData } from '@toolkit-tw-bot/document';
import { searchBarbarians } from '../searchBarbarians'
import { searchBarbariansView } from '../searchBarbarians/view'

export function createSearchBarbariansConfigSection() {
  const gameData = getGameData()
  const hasFarmAssistant = gameData?.features?.FarmAssistent?.active;

  let hasRequirements = true;
  let missingReason = '';

  if (!hasFarmAssistant) {
    hasRequirements = false;
    missingReason = 'Requer Assistente de Saque ativo no jogo.';
  }

  if (!hasRequirements) {
    return {
      id: 'map-search-barbarians',
      label: 'Search Barbarians',
      statusLabel: 'Sem requerimentos',
      statusTone: 'danger',
      statusTooltip: missingReason,
      mount: (container, sectionApi) => {
        if (typeof sectionApi.setStatus === 'function') {
          sectionApi.setStatus('Sem requerimentos', 'danger', missingReason);
        }
        const url = new URL(window.location.href)
        const btnUrl = new URL(gameData.link_base_pure, window.location.origin)
        btnUrl.searchParams.set('screen', 'premium')
        btnUrl.searchParams.set('mode', 'use')
        container.innerHTML = `
          <div class="go-bvcp-missing-reqs">
            <div class="go-bvcp-missing-reqs-text">${missingReason}</div>
            ${url.searchParams.get('screen') !== 'premium' && url.searchParams.get('mode') !== 'use' ? (`
              <a href="${btnUrl.toString()}" class="btn go-bvcp-action-button">Ativar</a>
            `) : ''}
          </div>
        `;
        return { destroy: () => {} };
      }
    }
  }

  return {
    id: 'map-search-barbarians',
    label: 'Search Barbarians',
    mount: (container) => {
      const searchContext = searchBarbarians()

      if (!searchContext) {
        return null
      }

      const view = searchBarbariansView({
        ...searchContext,
        mountTarget: container,
      })

      return typeof view?.destroy === 'function'
        ? () => view.destroy()
        : null
    },
  }
}

export function createMapConfigSections() {
  return [
    createSearchBarbariansConfigSection(),
  ]
}

export default createMapConfigSections
