import {
  SendCancelled,
  sendGcode,
  type RobotTransport,
  type SendOptions,
  type SendProgress,
} from './sender';
import { stopRobot, type StopOptions } from './stop';

export type JobResult = {
  state: 'done' | 'cancelled' | 'failed';
  progress: SendProgress;
  error?: string;
  /**
   * True when the robot may still be moving with the pen down (cancelled, failed or
   * disconnected mid-job): it must be stopped and the pen lifted before anything else.
   */
  needsStop: boolean;
};

export type JobOptions = {
  send: Omit<SendOptions, 'isCancelled' | 'onProgress'>;
  onProgress?: (progress: SendProgress) => void;
  /** The person pressed Cancel. */
  userCancelled: () => boolean;
  /** The Bluetooth link dropped. */
  disconnected: () => boolean;
};

/**
 * Sends a job and classifies how it ended. A dropped connection is a failure (never a
 * "cancel"), and the job is never resumed: the next connection must stop the robot first
 * (`recoverOnConnect`) and the person re-sends from the start.
 */
export async function runJob(
  transport: RobotTransport,
  gcode: string,
  options: JobOptions
): Promise<JobResult> {
  let last: SendProgress = {
    unit: options.send.ackMode === 'grbl' ? 'line' : 'chunk',
    chunksSent: 0,
    chunkCount: 0,
    bytesSent: 0,
    byteCount: 0,
  };
  try {
    last = await sendGcode(transport, gcode, {
      ...options.send,
      isCancelled: () => options.userCancelled() || options.disconnected(),
      onProgress: (progress) => {
        last = progress;
        options.onProgress?.(progress);
      },
    });
    return { state: 'done', progress: last, needsStop: false };
  } catch (e) {
    if (options.disconnected()) {
      return {
        state: 'failed',
        progress: last,
        needsStop: true,
        error:
          `Connection lost after ${last.chunksSent} of ${last.chunkCount} ${last.unit}s. ` +
          'The robot will be stopped and the pen lifted when it reconnects; send the job again.',
      };
    }
    if (e instanceof SendCancelled) return { state: 'cancelled', progress: last, needsStop: true };
    return {
      state: 'failed',
      progress: last,
      needsStop: true,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Run right after connecting: if the previous job was interrupted, stop the robot first. */
export async function recoverOnConnect(
  transport: RobotTransport,
  needsStop: boolean,
  stop: StopOptions
): Promise<string[]> {
  if (!needsStop) return [];
  return stopRobot(transport, stop);
}
