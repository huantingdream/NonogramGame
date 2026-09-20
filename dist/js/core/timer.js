// 共享计时器：游戏在首次操作时 start，胜利或新局时 stop/reset。

export function createTimer(onTick) {
  let startedAt = null;
  let elapsed = 0;
  let intervalId = null;

  function currentElapsed() {
    if (startedAt === null) return elapsed;
    return Math.floor((Date.now() - startedAt) / 1000);
  }

  function tick() {
    elapsed = currentElapsed();
    onTick(elapsed);
  }

  return {
    start() {
      if (startedAt !== null) return;
      startedAt = Date.now() - elapsed * 1000;
      intervalId = window.setInterval(tick, 1000);
    },
    stop() {
      window.clearInterval(intervalId);
      intervalId = null;
      elapsed = currentElapsed();
      startedAt = null;
      onTick(elapsed);
    },
    reset() {
      window.clearInterval(intervalId);
      intervalId = null;
      startedAt = null;
      elapsed = 0;
      onTick(0);
    },
    elapsed: currentElapsed,
    get running() {
      return startedAt !== null;
    }
  };
}
