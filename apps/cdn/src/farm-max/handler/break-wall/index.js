import { Distance } from "@toolkit-tw-bot/core";
import { ProtectingBot } from "@toolkit-tw-bot/document";
import { storageFarmSchedules } from "../../config";
import { storageBreakWallTemplates } from "../../config/break-wall";
import { getBreakWallReports, saveBreakWallReports } from "../../config/break-wall/reports";
import { getAvaiablesSents, getSentByTarget, isSentByTarget, removeSentByTarget, saveTargetSent } from "../../config/break-wall/targets-sent";
import { dataConfig } from "../../config/data";
import { sleep } from "../../utils/sleep";
import { reportsHandler } from "../reports";
import { fetchReportView } from "../reports/request";
import { getAvaiablesReportBreakWall } from "./avaiables-reports";
import { execute } from "./execute";
import { dateTimeNow } from "../../../stable-compat/date-tw";

/**
 * Não envia se já tem qualquer ataque indo
 * Não envia se tem tropa na vila
 * Não envia se já enviou um quebra muro e retornou vermelho
 */

async function schedulerBreakWall(html = document) {
  const templates = await storageBreakWallTemplates.get()
  const { breakWall: configBreakWall } = await dataConfig()
  const breakWallReports = await getBreakWallReports() || []
  const { values: senders } = (await storageFarmSchedules.get()) || { values: [] }
  const avaiablesReports = await getAvaiablesReportBreakWall(html)
  const { avaible: breakWallSents = [] } = (await getAvaiablesSents()) || {}
  if (avaiablesReports.length) {
    avaiablesReports.forEach(({target, x, y, wall, report_id, type, report_time}) => {
      const calculateDistance = Distance.create({ x, y })
      const template = wall ? templates[wall] : templates[configBreakWall.template]

      // cai fora se a vila já estiver programada ou já enviou
      if (
        !(breakWallReports || []).find(report => Number(report.target) === Number(target)) &&
        !(breakWallSents || []).find(report => Number(report.target) === Number(target))
      ) {
        const [send] = senders.reduce((sends, {id, name, units}) => {
          // desconta as tropas já agendadas para a villa
          if (breakWallReports.lenght) {
            breakWallReports.forEach((report) => { // {id, template, distance, target, x, y, wall}
              if (Number(report.id) === Number(id)) {
                Object.keys(report.template).forEach(key => { units[key] -= report.template[key] })
              }
            })
          }
          const isTroops = () => {
            return Object.keys(template).reduce((validate, key) => {
              if (template[key] > 0 && units[key] < template[key]) validate = false
              return validate
            }, true)
          }

          if (isTroops()) {
            const coordMatch = name.trim().match(/\((\d+\|\d+)\) K\d+$/);

            if (coordMatch) {
              const [x, y] = coordMatch[1].split('|');
              const distance = calculateDistance.round({x, y})

              if (distance <= configBreakWall.maxDistance) {
                sends.push({
                    id,
                    template,
                    distance,
                })

                // atualiza a quantidade de tropas
                Object.keys(template).forEach(key => { units[key] -= template[key] })

              }
            }
          }

          return sends
        }, []).sort((a, b) => {
          if (a.distance > b.distance) return 1
          if (a.distance < b.distance) return -1
          return 0
        })

        if (send) {
          breakWallReports.push({...send, target, x, y, report_id, report_time, type, wall})
        }

      }
    })
    await saveBreakWallReports(breakWallReports)
  }

  return await getBreakWallReports()
}

async function handlerBreakWall(data, api, d = document, w = window) {
  const { breakWall: configBreakWall } = await dataConfig()
  if (!configBreakWall.active) return
  api.footer.set(`Verificando se existem muralhas para quebrar...`, 'warn');

  const breakWall = await schedulerBreakWall(d)
  if (!breakWall.length) return
  if (!breakWall.filter(({id}) => id === data.village.id).length) return

  let count = 1

  const sents = []

  for (const report of breakWall) {
    try {
      const isSent = await isSentByTarget(report.target).catch(() => ({ avaiable: false, alive: false, check: false })) || {}

      if (isSent.avaiable) continue
      if (Number(report.id) !== Number(data.village.id)) continue
      if (typeof report.wall === 'number' && report.wall === 0) continue
      if (isSent.alive) {
        const targetSent = await getSentByTarget(report.target).catch(() => ({})) || {}
        if (Number(report.report_id) === Number(targetSent.report_id)) continue
      }

      if (isSent.check) {
        const targetSent = await getSentByTarget(report.target)
        if (!('report_id' in targetSent)) {
          try {
            if (ProtectingBot["bot-protect-all-in-game"].active(d, w) || ProtectingBot["bot-protect-all-in-game"].active()) {
              api.footer.set(`hCaptcha identificado! Encerrando...`, "err");
              await sleep(1000, 1111);
              throw ProtectingBot.error();
            }

            const reportId = await reportsHandler(data, targetSent, api, d, w)
            if (reportId) {
              if (ProtectingBot["bot-protect-all-in-game"].active(d, w) || ProtectingBot["bot-protect-all-in-game"].active()) {
                api.footer.set(`hCaptcha identificado! Encerrando...`, "err");
                await sleep(1000, 1111);
                throw ProtectingBot.error();
              }

              const response = await fetchReportView(data.village.id, reportId)
              //{ alive, units, wall, destroy: { target, level },  buildings }
              targetSent.report_id = Number(reportId)
              targetSent.wall = response.wall
              if (response.alive) {
                targetSent.alive = response.alive
                targetSent.units = response.units
                await saveTargetSent(targetSent)
                continue
              }
              if (response.wall) {
                report.wall = response.wall
              }
            }
          } catch (err) {
            console.error(err)
            continue
          }
        }
      } else {
        try {
          if (report.type !== 'red') {
            if (ProtectingBot["bot-protect-all-in-game"].active(d, w) || ProtectingBot["bot-protect-all-in-game"].active()) {
              api.footer.set(`hCaptcha identificado! Encerrando...`, "err");
              await sleep(1000, 1111);
              throw ProtectingBot.error();
            }

            const response = await fetchReportView(data.village.id, report.report_id)
            //{ alive, units, wall, destroy: { target, level },  buildings }
            if (response.alive) {
              const targetSent = {
                target: report.target,
                x: report.x,
                y: report.y,
                report_id: report.report_id,
                alive: response.alive,
                units: response.units,
                wall: report.wall
              }
              await saveTargetSent(targetSent)
              continue
            }
            if (response.wall) {
              report.wall = response.wall
            }
          }
        } catch (err) {
          console.error(err)
          continue
        }
      }

      if (ProtectingBot["bot-protect-all-in-game"].active(d, w) || ProtectingBot["bot-protect-all-in-game"].active()) {
        api.footer.set(`hCaptcha identificado! Encerrando...`, "err");
        await sleep(1000, 1111);
        throw ProtectingBot.error();
      }

      if (!report.template) {
        const templates = await storageBreakWallTemplates.get()
        report.template = templates[report.wall ?? configBreakWall.template]
      }
      const { target, x, y, arrival, duration, message } = await execute(data.village.id, report.template, report.target, report.x, report.y, api, d, w )
      sents.push({ target, x, y, arrival, duration })
      api.footer.set(`[${count}] ${message} Chegada: ${new Date(arrival).toLocaleString()}`, 'ok');
      count++
    } catch (error) {
      if (error?.message === 'Identified bot protection') throw error;
      console.error(error.message || error.toString())
      api.footer.set(error.message || error.toString(), 'err');
    } finally {
      await sleep()
    }
  }

  for (const sent of sents) {
    await saveTargetSent(sent)
  }

  await saveBreakWallReports([...breakWall.filter(({ id }) => Number(id) !== Number(data.village.id))])

  const { check = [] } = (await getAvaiablesSents()) || {};
  for (const { target, arrival, duration } of check) {
    if (arrival + ((duration ?? 3600) * 1000) < dateTimeNow()) {
      await removeSentByTarget(target)
    }
  }
}

export { handlerBreakWall }
