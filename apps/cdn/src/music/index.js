import soundConfig from "./config.json"

const DEFAULT_SOUND_URL = "chrome-extension://ikdgpfehhakffkfhcjnnjgaaigfoknbl/sounds/Snob-4s.mp3"

const collectSoundEntries = (value, bucket = {}) => {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectSoundEntries(entry, bucket))
    return bucket
  }

  if (!value || typeof value !== "object") {
    return bucket
  }

  Object.entries(value).forEach(([key, entryValue]) => {
    if (typeof entryValue === "string" && entryValue.trim()) {
      bucket[key] = entryValue.trim()
      return
    }

    collectSoundEntries(entryValue, bucket)
  })

  return bucket
}

const SOUND_BY_TYPE = collectSoundEntries(soundConfig)

const resolveSoundUrl = (type = "") => {
  const soundType = String(type || "").trim()

  if (soundType && typeof SOUND_BY_TYPE[soundType] === "string") {
    return SOUND_BY_TYPE[soundType]
  }

  return SOUND_BY_TYPE.solver || DEFAULT_SOUND_URL
}

const Sounds = {
  sound: resolveSoundUrl("solver"),

  show: null,
  interval: null,
  elemNode: null,

  use(type = "solver") {
    const nextSound = resolveSoundUrl(type)

    if (Sounds.sound === nextSound) {
      return nextSound
    }

    const wasPlaying = Boolean(Sounds.interval)
    Sounds.pause()
    Sounds.sound = nextSound

    if (wasPlaying) {
      Sounds.play()
    }

    return nextSound
  },

  play: () => {
    if (Sounds.interval) return; // Trava: se já está tocando em loop, não faz nada

    if (!Sounds.show) Sounds.show = Sounds.audio()
    Sounds.show.play()
    Sounds.interval = setInterval(() => {
      Sounds.show.play()
    }, 5 * 1000);
  },

  audio: () => new Audio(Sounds.sound),

  pause() {
    if (Sounds.interval) {
      clearInterval(Sounds.interval)
      Sounds.interval = null
      Sounds.show?.pause?.()
      Sounds.show = null
    }
  },

  listner(selector) {
    if (!selector) return
    Sounds.elemNode = document.querySelector(selector)
    if (!Sounds.elemNode) return
    Sounds.elemNode.addEventListener("click", Sounds.event)
  },

  ["remove-listner"]: () => Sounds.elemNode?.removeEventListener?.("click", Sounds.event),

  event: () => !Sounds.interval ? Sounds.play() : Sounds.pause()
}

export { Sounds }
