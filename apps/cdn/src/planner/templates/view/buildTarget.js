// planner/templates/view/buildTarget.js
import { getGameData } from '@toolkit-tw-bot/document';
import { getMaxBuildings } from '../../../stable-compat/max-buildings';

const getCurrentGameData = () => {
  if (typeof window !== "undefined" && typeof window.game_data !== "undefined") {
    return window.game_data
  }

  if (typeof document === "undefined") return null

  return getGameData()
}

function createBuildTargetRadio(plannerTemplates) {
  const buildTarget = plannerTemplates.querySelector('.go-template-build-target');
  let selected;
  const insert = () => {
    const gameData = getCurrentGameData()
    const villageBuildings = gameData?.village?.buildings && typeof gameData.village.buildings === 'object'
      ? gameData.village.buildings
      : {}
    const maxBuildings = getMaxBuildings(gameData?.market)
    const buildTargetRadio = Object.keys(villageBuildings).map(build => {
      if (['hide', 'church_f'].includes(build)) return '';
      return `
        <button name="building:${build}" class="go-build-target" data-title="${maxBuildings?.[build]?.trans || build}">
          <img name="building:${build}" src="https://dsbr.innogamescdn.com/asset/98f3b7c4/graphic/buildings/${build}.webp">
        </button>
      `;
    }).join('\n ') + `<span class="go-dtgrp-label" name="go-bt-title">Alvo da catapulta:</span><span id="go-bt-title"></span>`
    buildTarget.innerHTML = buildTargetRadio;
    const onClickBuildTarget = (e) => {
      const selectedNode = e.target?.closest?.('button.go-build-target[name]')
      const name = selectedNode?.getAttribute?.('name') || ''
      if (!name) return
      if (selected) {
        buildTarget.querySelector(`button[name="${selected}"]`)?.classList.remove('go-btselected')
      }
      selectedNode.classList.add('go-btselected')
      const titleNode = buildTarget.querySelector('#go-bt-title')
      if (titleNode) titleNode.textContent = selectedNode.dataset.title || ''
      selected = name;
      plannerTemplates.dispatchEvent(
        new CustomEvent('go:buildtarget:selected', {
          bubbles: true,
          detail: { name }
        })
      )
      plannerTemplates.dispatchEvent(new CustomEvent('go:units:changed', { bubbles: true }))
    }
    buildTarget.addEventListener('click', onClickBuildTarget);
    return () => buildTarget.removeEventListener('click', onClickBuildTarget);
  }
  const hidden = () => {
    buildTarget.classList.add('hidden');
  }
  const show = () => {
    buildTarget.classList.remove('hidden');
    if (!selected) select('building:place')
  }
  const getSelected = () => selected
  const select = (name) => {
    if (!name) return;
    const selectedNode = buildTarget.querySelector(`button[name="${name}"]`)
    if (!selectedNode) return
    if (selected) {
      buildTarget.querySelector(`button[name="${selected}"]`)?.classList.remove('go-btselected')
    }
    selectedNode.classList.add('go-btselected')
    const titleNode = buildTarget.querySelector('#go-bt-title')
    if (titleNode) titleNode.textContent = selectedNode.dataset.title || ''
    selected = name
  }
  const unbindInsert = insert();
  const destroy = () => {
    hidden();
    unbindInsert();
  }

  return { selected, hidden, show, destroy, getSelected, select };
}

export { createBuildTargetRadio }
