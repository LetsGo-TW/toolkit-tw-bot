import { sleepAbort } from "./sleep";

async function runLoop({ condition, step, randomInterval = { min: 201, max: 301 }, signal }) {
  try {
    while (!signal.aborted && await condition()) {
      await step(signal);                // faça seu trabalho aqui (pode ter fetch com {signal})
      if (randomInterval) await sleepAbort(randomInterval, { signal }); // dá uma respirada entre iterações
    }
  } catch (err) {
    if (err.name !== 'AbortError') console.error('loop error:', err);
  }
}

export { runLoop }
