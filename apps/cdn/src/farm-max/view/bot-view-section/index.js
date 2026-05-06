import './style.css'
import { initFarmConfig, storageConfigFarm } from '../../config';

const FARM_MAX_YOUTUBE_URL = 'https://www.youtube.com/playlist?list=PLo4rLFftjcxHCs7eqMxP1Jf3ivwohXXJr';

const montFarmMaxConfig = (container, sectionApi = {}) => {
  const popoverDetail = container.closest('.go-bot-view-config-popover') || document.querySelector("div.go-bot-view-config-popover.go-bot-view-config-popover-detail")
  
  let isDestroyed = false;
  let destroyFarmMaxView = null;

  const onMessage = (event) => {
    if (event.data?.target === 'GO-FARM' && event.data?.action === 'set-farm-active') {
      const active = !!event.data.args?.active;
      console.debug('[FarmMax Menu] Atualizando status:', { active, sectionApi });
      const statusLabel = active ? 'Ativo' : 'Desligado'
      const statusTone = active ? 'active' : 'danger'
      sectionApi.setStatus(statusLabel, statusTone)

        const headerCheckbox = document.getElementById('go-farm-header-active');
        if (headerCheckbox && headerCheckbox.checked !== active) {
          headerCheckbox.checked = active;
        }
    }
  };
  window.addEventListener('message', onMessage);

  if (typeof sectionApi.setYoutubeLink === 'function') {
    sectionApi.setYoutubeLink(FARM_MAX_YOUTUBE_URL);
  }

  // Usa uma classe e injeção de CSS para forçar os estilos,
  // pois a biblioteca de popover sobrescreve estilos inline continuamente.
  if (popoverDetail) {
    popoverDetail.classList.add('go-farm-max-override');
    if (!document.getElementById('go-farm-max-override-style')) {
      const styleSheet = document.createElement('style');
      styleSheet.id = 'go-farm-max-override-style';
      styleSheet.innerHTML = `
        .go-farm-max-override {
          top: 56px !important;
          height: 90% !important;
          max-height: none !important;
          min-width: 850px !important;
        }
      `;
      document.head.appendChild(styleSheet);
    }
  }

  import('../index.js').then(({ default: farmMaxView }) => {
    if (isDestroyed) return;
    farmMaxView.render(container).then(destroyFn => {
      if (isDestroyed) {
        if (typeof destroyFn === 'function') destroyFn();
      } else {
        destroyFarmMaxView = destroyFn;
      }
    });
  });

  // 2. Texto de próxima execução
  const nextExecNode = document.createElement('span');
  nextExecNode.id = 'go-farm-header-next-time'; 
  nextExecNode.textContent = 'Próxima execução: Aguardando...';
  
  // 3. Toggle de Ligar/Desligar
  const toggleWrap = document.createElement('span');
  toggleWrap.classList.add('go-farm-header-toggle');

  const toggleLabelContent = document.createElement('label');
  toggleLabelContent.dataset.goTitle = 'Ligar/Desligar Auto-Farm';
  toggleLabelContent.textContent = 'Auto-Farm';
  toggleLabelContent.htmlFor = 'go-farm-header-active';
  toggleLabelContent.classList.add('go-label');

  const toggleCheckbox = document.createElement('input');
  toggleCheckbox.type = 'checkbox';
  toggleCheckbox.id = 'go-farm-header-active';
  toggleCheckbox.classList.add('toggle');

  const toggleLabel = document.createElement('label');
  toggleLabel.htmlFor = 'go-farm-header-active';
  toggleLabel.dataset.goTitle = 'Ligar/Desligar Auto-Farm';
  toggleLabel.classList.add('toggle');

  storageConfigFarm.get().then(config => {
    toggleCheckbox.checked = !!config?.active;
  });

  const onChangeToggleCheckbox = async (e) => {
    const active = e.target.checked;
    const config = await storageConfigFarm.get() || {};
    config.active = active;
    await storageConfigFarm.set(config);

    // Avisa a aba de configuração que o status mudou (passando uma source diferente)
    window.postMessage({ source: 'FARM-HEADER', target: 'GO-FARM', action: 'set-farm-active', args: { active } });
  }
  
  toggleCheckbox.addEventListener('change', onChangeToggleCheckbox);

  toggleWrap.append(toggleLabelContent, toggleCheckbox, toggleLabel);
  
  // 4. Renderiza no cabeçalho
  sectionApi.setHeaderControls([
    nextExecNode,
    toggleWrap,
  ]);

  return {
    destroy: () => {
      isDestroyed = true;
      console.log('EXECUTOU DESTROY');
      if (typeof destroyFarmMaxView === 'function') destroyFarmMaxView();
      toggleCheckbox.removeEventListener('change', onChangeToggleCheckbox);
      window.removeEventListener('message', onMessage);
      if (popoverDetail) {
        popoverDetail.classList.remove('go-farm-max-override');
      }
    }
  }
}

export async function createFarmMaxBotViewSection() {
  await initFarmConfig()
  const farmMaxConfig = await storageConfigFarm.get()

  return {
    id: 'farm-max',
    label: 'Farm Max',
    groupId: 'auto',
    statusLabel: farmMaxConfig?.active ? 'Ativo' : 'Desligado',
    statusTone: farmMaxConfig?.active ? 'active' : 'danger',
    youtubeLink: FARM_MAX_YOUTUBE_URL,
    mount: (container, sectionApi) => montFarmMaxConfig(container, sectionApi)
  }
}
