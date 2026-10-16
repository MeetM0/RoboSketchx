import type { RobotTransport } from './sender';

export type StopOptions = {
  firmware: 'grbl' | 'custom';
  /** Custom firmware: command that stops motion and clears its queue (sent before pen-up). */
  stopCommand: string;
  /** The pen-up line for the current plotter settings. */
  penUpLine: string;
  /** How long to wait for GRBL's reset banner before carrying on. */
  bannerTimeoutMs?: number;
};

const FEED_HOLD = 0x21; // '!'
const SOFT_RESET = 0x18; // Ctrl-X

const ascii = (text: string) =>
  Uint8Array.from(text, (c) => (c.charCodeAt(0) < 128 ? c.charCodeAt(0) : 63));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Stops the robot *now*, then lifts the pen. Stopping the sender alone is not enough: the
 * controller keeps executing the moves already in its buffer with the pen down.
 *
 * GRBL: `!` (feed hold, decelerates and stops), `0x18` (soft reset, discards the buffer),
 * wait for the "Grbl …" banner, `$X` (GRBL alarm-locks after a reset during motion), then the
 * pen-up line. The machine position may be lost after a reset; re-home before the next job.
 *
 * Custom firmware: the configured stop command (if any), then the pen-up line.
 *
 * Returns a short log of the steps taken.
 */
export async function stopRobot(
  transport: RobotTransport,
  options: StopOptions
): Promise<string[]> {
  const steps: string[] = [];
  if (options.firmware === 'grbl') {
    let replies = '';
    const unsubscribe = transport.onText((t) => {
      replies += t;
    });
    try {
      await transport.write(Uint8Array.of(FEED_HOLD));
      steps.push('feed hold (!)');
      await sleep(100);
      await transport.write(Uint8Array.of(SOFT_RESET));
      steps.push('soft reset (0x18)');
      const deadline = Date.now() + (options.bannerTimeoutMs ?? 2000);
      while (!/grbl/i.test(replies) && Date.now() < deadline) await sleep(20);
      steps.push(/grbl/i.test(replies) ? 'controller reset' : 'no reset banner (continuing)');
      await transport.write(ascii('$X\n'));
      steps.push('unlock ($X)');
    } finally {
      unsubscribe();
    }
  } else if (options.stopCommand.trim()) {
    await transport.write(ascii(`${options.stopCommand.trim()}\n`));
    steps.push(`stop (${options.stopCommand.trim()})`);
  }
  await transport.write(ascii(`${options.penUpLine}\n`));
  steps.push(`pen up (${options.penUpLine})`);
  return steps;
}
