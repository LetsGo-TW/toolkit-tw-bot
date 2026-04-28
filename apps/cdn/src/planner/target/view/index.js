import './style.css'
import plannerTargetTextHtml from './index.html'
import { withGroupFix } from '../../../groups'
import { getGameData } from '@toolkit-tw-bot/document'
import { printMessage } from '../../../components/printMessage'

let incomingModulePromise = null

async function loadIncomingModule() {
  if (!incomingModulePromise) {
    incomingModulePromise = import('./incoming')
      .then((module) => {
        const createIncomingTargetController = module?.createIncomingTargetController
        if (typeof createIncomingTargetController !== 'function') {
          throw new Error('Módulo de incoming inválido.')
        }
        return { createIncomingTargetController }
      })
      .catch((error) => {
        incomingModulePromise = null
        throw error
      })
  }
  return incomingModulePromise
}

function parseFiniteNumber(value) {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function calcContinentFromCoords(x, y) {
  const numX = parseFiniteNumber(x)
  const numY = parseFiniteNumber(y)
  if (numX == null || numY == null) return null
  return (Math.floor(numY / 100) * 10) + Math.floor(numX / 100)
}

export function actionIncomingTargetInit(targetContent, village) {
  let currentVillage = village
  const btnIncoming = targetContent.querySelector('#go-btn-incoming')
  let incomingController = null
  let incomingControllerPromise = null

  const ensureIncomingController = async () => {
    if (incomingController) return incomingController
    if (!incomingControllerPromise) {
      incomingControllerPromise = loadIncomingModule()
        .then(({ createIncomingTargetController }) => {
          incomingController = createIncomingTargetController({
            targetContent,
            button: btnIncoming,
            getVillage: () => currentVillage
          })
          return incomingController
        })
        .finally(() => {
          incomingControllerPromise = null
        })
    }
    return incomingControllerPromise
  }

  const onRefreshIncomingTarget = async () => {
    if (!incomingController) return
    await incomingController.refresh?.()
  }

  const onPlannerTargetPreviewChange = (event) => {
    const nextVillage = event?.detail?.village
    if (!nextVillage || typeof nextVillage !== 'object') return
    currentVillage = nextVillage
    incomingController?.onVillageChange?.(nextVillage)
  }

  const onClickBtnIncoming = async () => {
    try {
      const controller = await ensureIncomingController()
      await controller.toggle?.()
    } catch (error) {
      console.error('[planner:incoming:lazy-load]', error)
      printMessage.error('Erro ao abrir chegadas.')
    }
  }

  const unbindActionIncomingTarget = () => {
    btnIncoming?.removeEventListener('click', onClickBtnIncoming)
    targetContent?.removeEventListener?.('go:planner:incoming:refresh', onRefreshIncomingTarget)
    targetContent?.removeEventListener?.('go:planner:target:preview-change', onPlannerTargetPreviewChange)
    incomingController?.destroy?.()
    incomingController = null
  }

  btnIncoming?.addEventListener('click', onClickBtnIncoming)
  targetContent?.addEventListener?.('go:planner:incoming:refresh', onRefreshIncomingTarget)
  targetContent?.addEventListener?.('go:planner:target:preview-change', onPlannerTargetPreviewChange)

  return unbindActionIncomingTarget;
}

function renderPlannerTargetNameHtml(village = null) {
  const gameData = getGameData();
  const targetX = parseFiniteNumber(village?.x)
  const targetY = parseFiniteNumber(village?.y)
  const targetK = parseFiniteNumber(village?.k) ?? calcContinentFromCoords(targetX, targetY)
  const hasCoords = targetX != null && targetY != null
  const hasK = targetK != null
  const targetId = parseFiniteNumber(village?.id)
  const villageName = String(village?.name || '---').trim() || '---'
  return `
    <span class="village_anchor contexted" data-player="${village?.playerId ?? ''}" data-id="${targetId ?? ''}">
      ${targetId != null ? `
        <a class="go-name-ellipsis" data-title="${villageName}" href="${withGroupFix(`/game.php?village=${gameData.village.id}&screen=info_village&id=${targetId}`)}">
          ${villageName}
        </a>
      ` : `
        <span class="go-name-ellipsis" data-title="${villageName}">${villageName}</span>
      `}
      ${hasCoords ? `<span>(${targetX}|${targetY})</span>` : ''}
      ${hasK ? `<span>K${targetK}</span>` : ''}
      ${village?.bonusId ? (
        `<span class="bonus_icon bonus_icon_${village.bonusId}"></span>`
      ) : ''}
    </span>
  `;
}

function renderPlannerTargetInfoHtml(village = null, ally = null) {
  const pointsText = village?.textPoints ?? '---'
  const ownerName = String(village?.player_name || '').trim() || '---'
  const allyName = String(ally?.name || '').trim()
  const moraleLabel = String(village?.moraleLabel || '').trim()
  const nightBonusLabel = String(village?.nightBonusLabel || '').trim()
  const ownerTitle = String(village?.playerTitle || '').trim()
  const allyTitle = String(village?.allyTitle || '').trim()
  return `
    <span><strong>Pontos:</strong> ${pointsText}</span>
    ${ownerTitle
      ? `<span data-title="${ownerTitle}"><strong>Proprietário:</strong> ${ownerName}</span>`
      : `<span><strong>Proprietário:</strong> ${ownerName}</span>`
    }
    ${allyName
      ? (allyTitle
        ? `<span data-title="${allyTitle}"><strong>Tribo:</strong> ${allyName}</span>`
        : `<span><strong>Tribo:</strong> ${allyName}</span>`)
      : ''
    }
    ${moraleLabel ? `<span><strong>Moral:</strong> ${moraleLabel}</span>` : ''}
    ${nightBonusLabel ? `<span><strong>Bônus noturno:</strong> ${nightBonusLabel}</span>` : ''}
  `;
}

export function updatePlannerTargetCard(targetContent, village, ally = null) {
  if (!targetContent || !village || typeof village !== 'object') return null
  const root = targetContent?.querySelector?.('#go-target-content') || targetContent
  if (!root) return null
  const villageItemImage = root.querySelector('.village-picture');
  if (villageItemImage && village?.image) villageItemImage.src = village.image;
  const villageItemName = root.querySelector('.village-name');
  if (villageItemName) villageItemName.innerHTML = renderPlannerTargetNameHtml(village);
  const villageItemInfo = root.querySelector('.village-info');
  if (villageItemInfo) {
    villageItemInfo.classList.add('go-target-village-info')
    villageItemInfo.innerHTML = renderPlannerTargetInfoHtml(village, ally);
  }
  return root
}

export function plannerTargetView(village, ally) {
  const plannerTargetNode = document.createElement('div');
  plannerTargetNode.id = 'go-target-content';
  plannerTargetNode.insertAdjacentHTML('beforeend', plannerTargetTextHtml);
  const villageItemImage = plannerTargetNode.querySelector('.village-picture');
  villageItemImage.src = village.image;
  const villageItemName = plannerTargetNode.querySelector('.village-name');
  villageItemName.innerHTML = renderPlannerTargetNameHtml(village);
  const villageItemInfo = plannerTargetNode.querySelector('.village-info');
  villageItemInfo.innerHTML = renderPlannerTargetInfoHtml(village, ally);
  return plannerTargetNode;
}
