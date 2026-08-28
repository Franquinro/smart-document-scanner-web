export function getPreviewMaxDimension(viewportWidth, dragging = false) {
  const mobile = Number(viewportWidth) <= 700;
  if (dragging) return mobile ? 480 : 640;
  return mobile ? 640 : 960;
}

export function getExportMaxDimension(source) {
  return Math.max(Number(source.width) || 0, Number(source.height) || 0);
}

export function createRafCoalescer(callback, requestFrame = globalThis.requestAnimationFrame, cancelFrame = globalThis.cancelAnimationFrame) {
  let frame = null;
  let latestArgs = [];
  const schedule = (...args) => {
    latestArgs = args;
    if (frame !== null) return;
    frame = requestFrame(() => {
      if (frame === null) return;
      frame = null;
      callback(...latestArgs);
    });
  };
  schedule.cancel = () => {
    if (frame === null) return;
    cancelFrame?.(frame);
    frame = null;
  };
  return schedule;
}

export function createDebouncedTask(callback, delay = 200, setTimer = setTimeout, clearTimer = clearTimeout) {
  let timer = null;
  let latestArgs = [];
  return (...args) => {
    latestArgs = args;
    if (timer !== null) clearTimer(timer);
    timer = setTimer(() => {
      timer = null;
      callback(...latestArgs);
    }, delay);
  };
}

export function createGenerationGate() {
  let generation = 0;
  return {
    begin: () => ++generation,
    isCurrent: value => value === generation,
  };
}

export function getCachedValue(cache, key, factory) {
  if (!cache.has(key)) cache.set(key, factory());
  return cache.get(key);
}
