import { chunkGcode, type AckMode } from './protocol';

/** The minimum a connected robot must offer for sending. */
export type RobotTransport = {
  write(bytes: Uint8Array): Promise<void>;
  /** Subscribes to text the robot sends back; returns an unsubscribe function. */
  onText(listener: (text: string) => void): () => void;
};

export type SendProgress = {
  /** What a "chunk" is: a BLE write (`chunk`) or a G-code line (`line`, GRBL streaming). */
  unit: 'chunk' | 'line';
  /** Chunks / lines the robot has received (acknowledged by BLE). */
  chunksSent: number;
  chunkCount: number;
  bytesSent: number;
  byteCount: number;
};

export type SendOptions = {
  payloadBytes: number;
  ackMode: AckMode;
  ackToken: string;
  ackTimeoutMs: number;
  /** Size of the controller's serial receive buffer, for `ackMode: 'grbl'`. */
  rxBufferBytes?: number;
  onProgress?: (progress: SendProgress) => void;
  /** Checked between chunks; when it returns true sending stops with a `SendCancelled` error. */
  isCancelled?: () => boolean;
};

export class SendCancelled extends Error {
  constructor() {
    super('Sending was cancelled.');
    this.name = 'SendCancelled';
  }
}

/**
 * Streams G-code to the robot chunk by chunk, waiting for each write (and, depending on
 * `ackMode`, for the robot's "ok" replies) before sending the next chunk.
 */
export async function sendGcode(
  transport: RobotTransport,
  gcode: string,
  options: SendOptions
): Promise<SendProgress> {
  if (options.ackMode === 'grbl') return streamGrbl(transport, gcode, options);
  const chunks = chunkGcode(gcode, options.payloadBytes);
  const progress: SendProgress = {
    unit: 'chunk',
    chunksSent: 0,
    chunkCount: chunks.length,
    bytesSent: 0,
    byteCount: chunks.reduce((sum, c) => sum + c.bytes.length, 0),
  };
  options.onProgress?.({ ...progress });

  const acks = new AckCounter(options.ackToken);
  const unsubscribe = options.ackMode === 'none' ? () => {} : transport.onText((t) => acks.push(t));
  try {
    for (const chunk of chunks) {
      if (options.isCancelled?.()) throw new SendCancelled();
      const expected =
        options.ackMode === 'line' ? chunk.lines : options.ackMode === 'chunk' ? 1 : 0;
      const target = acks.count + expected;
      await transport.write(chunk.bytes);
      // Count the chunk once the robot has it, so a cancel reports exactly what it received.
      progress.chunksSent++;
      progress.bytesSent += chunk.bytes.length;
      options.onProgress?.({ ...progress });
      if (expected > 0) await acks.waitFor(target, options.ackTimeoutMs, options.isCancelled);
    }
  } finally {
    unsubscribe();
  }
  return progress;
}

/**
 * GRBL "character counting" streaming: the controller's serial RX buffer holds
 * `rxBufferBytes`; a line may only be sent while the bytes of all unacknowledged lines plus
 * this one fit in it. Every "ok" frees the oldest line. Lines are packed into BLE writes of at
 * most `payloadBytes` (the transport limit) — the buffer limit is what provides flow control.
 */
async function streamGrbl(
  transport: RobotTransport,
  gcode: string,
  options: SendOptions
): Promise<SendProgress> {
  const rx = options.rxBufferBytes ?? 128;
  const lines = gcode
    .split(/\r?\n/)
    .map((l) => l.replace(/;.*$/, '').trim())
    .filter(Boolean)
    .map((l) => `${l}\n`);
  const tooLong = lines.find((l) => l.length >= rx);
  if (tooLong)
    throw new Error(
      `A G-code line is longer than the robot's ${rx}-byte buffer: ${tooLong.trim()}`
    );

  const progress: SendProgress = {
    unit: 'line',
    chunksSent: 0,
    chunkCount: lines.length,
    bytesSent: 0,
    byteCount: lines.reduce((sum, l) => sum + l.length, 0),
  };
  options.onProgress?.({ ...progress });

  const acks = new AckCounter(options.ackToken);
  const unsubscribe = transport.onText((t) => acks.push(t));
  const inFlight: number[] = [];
  let used = 0;
  let released = 0;
  const release = () => {
    while (released < acks.count && inFlight.length) {
      used -= inFlight.shift()!;
      released++;
    }
  };
  try {
    let next = 0;
    while (next < lines.length) {
      if (options.isCancelled?.()) throw new SendCancelled();
      acks.throwIfFailed();
      release();
      let packet = '';
      let count = 0;
      while (
        next < lines.length &&
        // GRBL's ring buffer holds rx − 1 bytes (its own stream.py keeps the sum < rx).
        used + lines[next].length < rx &&
        packet.length + lines[next].length <= options.payloadBytes
      ) {
        packet += lines[next];
        used += lines[next].length;
        inFlight.push(lines[next].length);
        next++;
        count++;
      }
      if (count === 0) {
        // Buffer full: wait for the controller to finish a line.
        await acks.waitFor(released + 1, options.ackTimeoutMs, options.isCancelled);
        continue;
      }
      await transport.write(asciiBytes(packet));
      progress.chunksSent += count;
      progress.bytesSent += packet.length;
      options.onProgress?.({ ...progress });
    }
    // Wait until the controller has accepted every line.
    await acks.waitFor(released + inFlight.length, options.ackTimeoutMs, options.isCancelled);
  } finally {
    unsubscribe();
  }
  return progress;
}

function asciiBytes(text: string): Uint8Array {
  return Uint8Array.from(text, (c) => (c.charCodeAt(0) < 128 ? c.charCodeAt(0) : 63));
}

/**
 * Counts reply lines equal to the ack token, coping with replies split across notifications.
 * GRBL `error:N` and `ALARM:N` replies fail the job.
 */
class AckCounter {
  count = 0;
  failure: string | null = null;
  private buffer = '';
  private waiters: (() => void)[] = [];

  constructor(private token: string) {}

  push(text: string) {
    this.buffer += text;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? '';
    for (const line of lines) {
      const reply = line.trim();
      if (reply.toLowerCase() === this.token.trim().toLowerCase()) this.count++;
      else if (/^(error|alarm)\b/i.test(reply) && !this.failure) this.failure = reply;
    }
    // A bare token without a newline (some firmware replies "ok" with no terminator).
    if (this.buffer.trim().toLowerCase() === this.token.trim().toLowerCase()) {
      this.count++;
      this.buffer = '';
    }
    this.waiters.splice(0).forEach((wake) => wake());
  }

  throwIfFailed() {
    if (this.failure) throw new Error(`The robot reported ${this.failure}; sending stopped.`);
  }

  async waitFor(target: number, timeoutMs: number, isCancelled?: () => boolean) {
    const deadline = Date.now() + timeoutMs;
    while (this.count < target) {
      this.throwIfFailed();
      if (isCancelled?.()) throw new SendCancelled();
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new Error(
          `The robot didn't reply "${this.token}" within ${Math.round(timeoutMs / 1000)} s. ` +
            'Check the flow-control setting matches your firmware.'
        );
      }
      // Wake on the next reply, or every 250 ms to re-check cancel / timeout.
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, Math.min(remaining, 250));
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }
}
