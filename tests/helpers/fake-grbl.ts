import type { RobotTransport } from '../../lib/robot/sender';

/**
 * A GRBL-like controller behind BLE: a fixed-size serial RX buffer, executes one line every
 * `lineMs` and replies "ok" (or an error for lines matching `failOn`). Records the largest
 * number of unprocessed bytes it ever held, so tests can detect buffer overflow.
 */
export function fakeGrbl({
  rxBufferBytes = 128,
  lineMs = 1,
  failOn,
}: { rxBufferBytes?: number; lineMs?: number; failOn?: RegExp } = {}) {
  const listeners = new Set<(t: string) => void>();
  let buffer = '';
  let maxBuffered = 0;
  const executed: string[] = [];
  const raw: number[][] = [];
  let resets = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const reply = (t: string) => listeners.forEach((l) => l(t));
  const pump = () => {
    timer = null;
    const nl = buffer.indexOf('\n');
    if (nl === -1) return;
    const line = buffer.slice(0, nl);
    buffer = buffer.slice(nl + 1);
    executed.push(line);
    reply(failOn?.test(line) ? 'error:22\r\n' : 'ok\r\n');
    if (buffer.includes('\n') && !held) timer = setTimeout(pump, lineMs);
  };
  let held = false;
  const transport: RobotTransport = {
    async write(bytes) {
      raw.push([...bytes]);
      for (const byte of bytes) {
        // GRBL realtime commands act immediately and never enter the buffer.
        if (byte === 0x21) {
          held = true; // '!' feed hold
          if (timer) clearTimeout(timer);
          timer = null;
          continue;
        }
        if (byte === 0x18) {
          // Soft reset: drop everything buffered, stop holding, print the banner.
          buffer = '';
          held = false;
          resets++;
          setTimeout(() => reply("\r\nGrbl 1.1h ['$' for help]\r\n"), 5);
          continue;
        }
        buffer += String.fromCharCode(byte);
      }
      maxBuffered = Math.max(maxBuffered, buffer.length);
      if (!timer && !held) timer = setTimeout(pump, lineMs);
    },
    onText(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
  return {
    transport,
    executed,
    raw,
    reply,
    get resets() {
      return resets;
    },
    get maxBuffered() {
      return maxBuffered;
    },
    rxBufferBytes,
  };
}
