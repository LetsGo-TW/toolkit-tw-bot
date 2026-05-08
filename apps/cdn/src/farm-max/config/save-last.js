import { storageConfigFarm, configBase } from "."

function getServerTimeInSeconds() {
  // window.Timing.getCurrentServerTime() é a fonte mais confiável de tempo do servidor, em milissegundos.
  if (window.Timing && typeof window.Timing.getCurrentServerTime === 'function') {
    return Math.floor(window.Timing.getCurrentServerTime() / 1000);
  }

  console.warn("[saveLastInConfig] Não foi possível obter o tempo do servidor via 'Timing.getCurrentServerTime()'. Usando o tempo do cliente como fallback. Isso pode causar inconsistências com o Bônus Noturno.");
  return Math.round(Date.now() / 1000);
}

async function saveLastInConfig(source, target) {
  const storageConfig = await storageConfigFarm.get() || configBase
  storageConfig.last = getServerTimeInSeconds() + 5
  await storageConfigFarm.set(storageConfig)
  window.postMessage({ source, target, action: "set-farm-last" });
}

export { saveLastInConfig }
