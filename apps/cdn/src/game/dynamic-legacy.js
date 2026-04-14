export const dynamicRunners = {
  "Incomings": async() => {
      const { default: Incomings } = await import('./incomings')
      return Incomings
  },

  "Call": async() => {
      const { default: Call } = await import('../Market/Call')
      return Call
  },

  "Offer": async() => {
      const { default: Offer } = await import('../Market/Offer')
      return Offer
  },

  "PullCoins": async() => {
      const { default: PullCoins } = await import('../Market/Pull')
      return PullCoins
  },

  "Sounds": async() => {
      const { default: Sounds } = await import('../Sounds')
      return Sounds
  },

  "Memo": async() => {
      const { default: Memo } = await import("./memo")
      return Memo
  },

  "Daily-Bonus": async() => {
      const { default: ReapDailyBonus } = await import("../Daily-Bonus")
      return ReapDailyBonus
  },

  "scavenge": async() => {
    const { default: scavenge } = await import("../Place/scavenge")
    return scavenge
  },

  "Object-Fake-Limit": async() => {
    const { default: ObjectFakeLimit } = await import('../Place/object-fake-limit')
    return ObjectFakeLimit
  },

  "farm-schedules": async() => {
    const { default: farmSchedules } = await import('../farm-max/schedules')
    return farmSchedules
  },

  "farm-handler": async() => {
    const { default: farmHandler } = await import('../farm-max/handler')
    return farmHandler
  }
}
