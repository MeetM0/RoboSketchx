import { chunkGcode, type AckMode } from './protocol';

/** The minimum a connected robot must offer for sending. */
export type RobotTransport = {
  write(bytes: Uint8Array): Promise<void>;
  /** Subscribes to text the robot sends back; returns an unsubscribe function. */
  onText(listener: (text: string) => void): () => void;
};

export type SendProgress = {
  /** Chunks the robot has received (acknowledged by BLE). */
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
  const chunks = chunkGcode(gcode, options.payloadBytes);
  const progress: SendProgress = {
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

/** Counts reply lines equal to the ack token, coping with replies split across notifications. */
class AckCounter {
  count = 0;
  private buffer = '';
  private waiters: (() => void)[] = [];

  constructor(private token: string) {}

  push(text: string) {
    this.buffer += text;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim().toLowerCase() === this.token.trim().toLowerCase()) this.count++;
    }
    // A bare token without a newline (some firmware replies "ok" with no terminator).
    if (this.buffer.trim().toLowerCase() === this.token.trim().toLowerCase()) {
      this.count++;
      this.buffer = '';
    }
    this.waiters.splice(0).forEach((wake) => wake());
  }

  async waitFor(target: number, timeoutMs: number, isCancelled?: () => boolean) {
    const deadline = Date.now() + timeoutMs;
    while (this.count < target) {
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
