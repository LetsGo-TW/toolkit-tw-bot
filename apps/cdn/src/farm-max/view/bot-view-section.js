import { initFarmConfig, storageConfigFarm } from '../config';

export async function createFarmMaxBotViewSection() {
  await initFarmConfig()
  const farmMaxConfig = await storageConfigFarm.get()

  return {
    id: 'farm-max',
    label: 'Farm Max',
    groupId: 'auto',
    statusLabel: farmMaxConfig?.active ? 'Ativo' : 'Desligado',
    statusTone: farmMaxConfig?.active ? 'active' : 'danger',
    mount: (container, sectionApi = {}) => {
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
        }
      };
      window.addEventListener('message', onMessage);

      // Guarda os estilos originais do popover definidos pelo framework do bot
      const originalStyles = {
        top: popoverDetail?.style?.top || '',
        height: popoverDetail?.style?.height || '',
        maxHeight: popoverDetail?.style?.maxHeight || '',
        minWidth: popoverDetail?.style?.minWidth || '',
      }
      popoverDetail?.style.setProperty('top', '56px')
      popoverDetail?.style.setProperty('height', '90%')
      popoverDetail?.style.setProperty('max-height', 'none')
      popoverDetail?.style.setProperty('min-width', '850px')

      import('./index.js').then(({ default: farmMaxView }) => {
        if (isDestroyed) return;
        farmMaxView.render(container).then(destroyFn => {
          if (isDestroyed) {
            if (typeof destroyFn === 'function') destroyFn();
          } else {
            destroyFarmMaxView = destroyFn;
          }
        });
      });

      return {
        destroy: () => {
          isDestroyed = true;
          console.log('EXECUTOU DESTROY');
          if (typeof destroyFarmMaxView === 'function') destroyFarmMaxView()
          window.removeEventListener('message', onMessage);
          if (popoverDetail) {
            if (originalStyles.top) popoverDetail.style.top = originalStyles.top; else popoverDetail.style.removeProperty('top');
            if (originalStyles.height) popoverDetail.style.height = originalStyles.height; else popoverDetail.style.removeProperty('height');
            if (originalStyles.maxHeight) popoverDetail.style.maxHeight = originalStyles.maxHeight; else popoverDetail.style.removeProperty('max-height');
            if (originalStyles.minWidth) popoverDetail.style.minWidth = originalStyles.minWidth; else popoverDetail.style.removeProperty('min-width');
          }
        }
      }
    }
  }
}
