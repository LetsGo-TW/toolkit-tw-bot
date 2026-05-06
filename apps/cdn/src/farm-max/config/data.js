import { storageConfigFarm, configBase } from "."

const dataConfig = async () => {
  // const configFarm = {
  //   "last": 0,
  //   "active": false,
  //   "season": 10,
  //   "maxVillages": 10,
  //   "attacksPerSecond": 4,
  //   "groupId": 0,
  //   "loadPages": 1,
  //   "timeNoRepeat": 10,
  //   "orderBy": "distance",
  //   "orderDir": "asc",
  //   "priority:Active": false,
  //   "priority:distance": 20,
  //   "breakWall:active": false,
  //   "breakWall:maxDistance": 5,
  //   "breakWall:template": 2,
  //   "breakWall:blue": false,
  //   "breakWall:yellow": true,
  //   "breakWall:red": false,
  //   "a:active": true,
  //   "a:maxDistance": 40,
  //   "a:maxWall": 0,
  //   "a:0:active": true,
  //   "a:0:maxAttacks": 2,
  //   "a:0:green": true,
  //   "a:0:yellow": false,
  //   "a:1:active": false,
  //   "a:1:maxAttacks": 2,
  //   "a:1:green": false,
  //   "a:1:yellow": false,
  //   "a:none:active": true,
  //   "a:none:maxAttacks": 2,
  //   "a:none:blue": true,
  //   "a:none:red_blue": false,
  //   "a:none:red_yellow": false,
  //   "a:none:red": false,
  //   "b:active": true,
  //   "b:maxDistance": 40,
  //   "b:maxWall": 1,
  //   "b:0:active": true,
  //   "b:0:maxAttacks": 1,
  //   "b:0:green": false,
  //   "b:0:yellow": true,
  //   "b:1:active": true,
  //   "b:1:maxAttacks": 2,
  //   "b:1:green": true,
  //   "b:1:yellow": true,
  //   "b:none:active": true,
  //   "b:none:maxAttacks": 1,
  //   "b:none:blue": true,
  //   "b:none:red_blue": false,
  //   "b:none:red_yellow": false,
  //   "b:none:red": false,
  //   "c:active": true,
  //   "c:maxDistance": 40,
  //   "c:maxWall": 2,
  //   "c:0:active": false,
  //   "c:0:maxAttacks": 1,
  //   "c:0:green": false,
  //   "c:0:yellow": false,
  //   "c:1:active": true,
  //   "c:1:maxAttacks": 2,
  //   "c:1:green": true,
  //   "c:1:yellow": true,
  //   "c:none:active": true,
  //   "c:none:maxAttacks": 1,
  //   "c:none:blue": true,
  //   "c:none:red_blue": false,
  //   "c:none:red_yellow": false,
  //   "c:none:red": false
  // }
  const configFarm = await storageConfigFarm.get() || configBase
  const popUnits = [1, 1, 1, 1, 2, 4, 5, 6, 10]
  const breakWall = Object.keys(configFarm).reduce((breakWall, key) => {
    if (key.includes('breakWall')) {
      breakWall[key.split('breakWall:')[1]] = configFarm[key]
    }
    return breakWall
  }, {})
  const buttons = ['c', 'a', 'b']
  const types = [
    "red_blue",
    "red_yellow",
    "red",
    "yellow",
    "blue",
    "green"
  ]
  const lotts = ['0', '1', 'none']
  const config = {
    ...Object.keys(configFarm)
    .reduce((config, key) => {
      if (buttons.filter(button => key.includes(`${button}:`)).length === 0) {
        config[key] = configFarm[key]
      } else {
        const button = buttons.find(button => key.includes(`${button}:`))
        if (!config[button]) config[button] = {}
        if (
          typeof configFarm[key] === 'number' ||
          (typeof configFarm[key] === 'boolean' && configFarm[key])
        ) {
          config[button][key.replace(`${button}:`, '')] = configFarm[key]
        }
      }

      return config
    }, {})
  }
  const ajaxActions = { c: 'farm_from_report', b: 'farm', a: 'farm' }
  return { config, buttons, types, lotts, ajaxActions, popUnits, breakWall }
}

export { dataConfig }
