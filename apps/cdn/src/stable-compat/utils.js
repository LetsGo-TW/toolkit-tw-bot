let millis = 0

function setMillis(added_time = 200) {
  const tmp = millis;
  millis += added_time;
  return tmp;
}

const sleep = async (seconds) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve()
    }, seconds * 1000);
  });
}

export { setMillis, sleep }
