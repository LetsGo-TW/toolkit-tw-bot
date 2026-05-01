import { timeZone } from "../stable-compat/date-tw"

export const SENDER_PRECISION = () => window.performance.timeOrigin + window.performance.now()
export const ZONE_TIME = () => timeZone() * 1000
