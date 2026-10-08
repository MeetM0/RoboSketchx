import type { RobotStatus, SendJob } from '@/lib/robot/robot-context';
import type { PlotterSettings } from '@/lib/sketch';

export type StatusTone = 'neutral' | 'progress' | 'success' | 'warning' | 'danger';

/** One short phrase for the robot's state, e.g. "Sending 42%". */
export function describeRobot(
  status: RobotStatus,
  robotName: string | null,
  job: SendJob | null
): { label: string; tone: StatusTone } {
  if (job?.state === 'sending')
    return {
      label: `Sending ${Math.round(jobFraction(job) * 100)}%`,
      tone: 'progress',
    };
  if (status === 'scanning') return { label: 'Searching…', tone: 'progress' };
  if (status === 'connecting') return { label: 'Connecting…', tone: 'progress' };
  if (status === 'connected') return { label: robotName ?? 'Connected', tone: 'success' };
  return { label: 'Not connected', tone: 'neutral' };
}

export function jobFraction(job: SendJob) {
  return job.progress.byteCount ? job.progress.bytesSent / job.progress.byteCount : 0;
}

/** Outcome sentence for a finished job. */
export function describeJob(job: SendJob): {
  title: string;
  message: string;
  tone: 'success' | 'warning' | 'error';
} | null {
  const { chunksSent, chunkCount, unit } = job.progress;
  switch (job.state) {
    case 'sending':
      return null;
    case 'done':
      return {
        tone: 'success',
        title: 'Sent to robot',
        message: `All ${chunkCount.toLocaleString()} ${unit}s delivered. The robot finishes drawing what it has buffered.`,
      };
    case 'cancelled':
      return job.penLifted
        ? {
            tone: 'warning',
            title: 'Stopped',
            message: `Stopped after ${chunksSent.toLocaleString()} of ${chunkCount.toLocaleString()} ${unit}s. The pen is lifted.`,
          }
        : {
            tone: 'error',
            title: 'Stopped — pen may still be down',
            message: `Stopped after ${chunksSent.toLocaleString()} of ${chunkCount.toLocaleString()} ${unit}s, but the pen-up command didn't reach the robot. It is sent as soon as you reconnect.`,
          };
    case 'failed':
      return {
        tone: 'error',
        title: 'Sending failed',
        message: `${job.error ?? 'Unknown error'} (after ${chunksSent.toLocaleString()} of ${chunkCount.toLocaleString()} ${unit}s). The robot was told to stop.`,
      };
  }
}

const PAPER_NAMES: Record<string, string> = {
  '210x297': 'A4',
  '148x210': 'A5',
  '216x279': 'Letter',
  '297x420': 'A3',
};

/** "A4", or the size in mm when it isn't a standard sheet. */
export function paperName(s: Pick<PlotterSettings, 'paperWidthMm' | 'paperHeightMm'>) {
  const short = Math.min(s.paperWidthMm, s.paperHeightMm);
  const long = Math.max(s.paperWidthMm, s.paperHeightMm);
  return PAPER_NAMES[`${short}x${long}`] ?? `${s.paperWidthMm} × ${s.paperHeightMm} mm`;
}

export const START_LABELS: Record<PlotterSettings['startMode'], string> = {
  g92: 'Where the pen is',
  g28: 'Reference position',
  home: 'Homing cycle',
};
