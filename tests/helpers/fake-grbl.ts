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
    if (buffer.includes('\n')) timer = setTimeout(pump, lineMs);
  };
  const transport: RobotTransport = {
    async write(bytes) {
      raw.push([...bytes]);
      buffer += String.fromCharCode(...bytes);
      maxBuffered = Math.max(maxBuffered, buffer.length);
      if (!timer) timer = setTimeout(pump, lineMs);
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
    get maxBuffered() {
      return maxBuffered;
    },
    rxBufferBytes,
  };
}
