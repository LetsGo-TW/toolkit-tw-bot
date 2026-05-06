const sleep = (min = 201, max = 601) => new Promise(resolve => {
  const ms = Math.floor(Math.random() * (max - min + 1) + min);
  setTimeout(resolve, ms);
});

// util para pausar sem travar a UI
function sleepAbort({ min = 201, max = 301 }, { signal } = {}) {
  return new Promise((res, rej) => {
    const ms = Math.floor(Math.random() * (max - min + 1) + min);
    const t = setTimeout(res, ms);
    if (signal) {
      if (signal.aborted) { clearTimeout(t); return rej(signal.reason); }
      signal.addEventListener('abort', () => { clearTimeout(t); rej(signal.reason); }, { once: true });
    }
  });
}

export { sleep, sleepAbort }
