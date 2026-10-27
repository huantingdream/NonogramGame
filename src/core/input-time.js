// DOM event timestamps share performance.now()'s monotonic time origin in modern
// browsers. Use the input's creation time, not the later handler execution time.
export function inputTime(event, handledAt = performance.now(), timeOrigin = performance.timeOrigin) {
  let timestamp = event.timeStamp;
  if (!Number.isFinite(timestamp)) return null;
  // Older engines may supply an epoch timestamp instead of a relative one.
  if (timestamp > 1e12) timestamp -= timeOrigin;
  // Fail closed: silently falling back to handledAt would reintroduce queue delay.
  // Allow 1 ms of clock quantization, but never fabricate a reaction duration.
  return Number.isFinite(timestamp) && timestamp > 0 && timestamp <= handledAt + 1
    ? timestamp : null;
}
