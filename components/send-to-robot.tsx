import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useRobot } from '@/lib/robot/robot-context';

type Props = {
  /** Builds the G-code on demand (only when sending). Null when there's nothing to send. */
  getGcode: (() => string) | null;
  penUpCommand: string;
  disabled?: boolean;
};

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;

/** "Send to robot" button with live chunk progress and cancel. */
export function SendToRobot({ getGcode, penUpCommand, disabled }: Props) {
  const colors = Colors[useColorScheme() ?? 'light'];
  const router = useRouter();
  const { status, robot, job, send, cancel } = useRobot();
  const sending = job?.state === 'sending';

  const connected = status === 'connected' && !!robot;
  const fraction =
    job && job.progress.byteCount ? job.progress.bytesSent / job.progress.byteCount : 0;

  return (
    <View style={styles.container}>
      {!connected ? (
        <View style={styles.row}>
          <Button
            title="Connect robot to send"
            icon="antenna.radiowaves.left.and.right"
            variant="secondary"
            onPress={() => router.navigate('/plotter')}
          />
        </View>
      ) : sending ? (
        <View style={styles.row}>
          <Button title="Cancel sending" icon="xmark" variant="secondary" onPress={cancel} />
        </View>
      ) : (
        <View style={styles.row}>
          <Button
            title={`Send to ${robot.name}`}
            icon="paperplane.fill"
            disabled={!getGcode || disabled}
            onPress={() => getGcode && send(getGcode(), penUpCommand)}
          />
        </View>
      )}

      {/* The last job's outcome stays visible even after the robot disconnects. */}
      {job && (
        <View style={styles.progress}>
          <View style={[styles.track, { backgroundColor: colors.card }]}>
            <View
              style={[
                styles.fill,
                {
                  width: `${Math.round(fraction * 100)}%`,
                  backgroundColor: job.state === 'failed' ? '#D93025' : colors.tint,
                },
              ]}
            />
          </View>
          <ThemedText
            style={[styles.small, { color: job.state === 'failed' ? '#D93025' : colors.icon }]}>
            {job.state === 'sending'
              ? `Sending ${job.progress.unit} ${Math.min(job.progress.chunksSent + 1, job.progress.chunkCount)} of ${job.progress.chunkCount} · ${kb(job.progress.bytesSent)} of ${kb(job.progress.byteCount)}`
              : job.state === 'done'
                ? `Sent ${job.progress.chunkCount} ${job.progress.unit}s (${kb(job.progress.byteCount)}).`
                : job.state === 'cancelled'
                  ? `Cancelled after ${job.progress.chunksSent} of ${job.progress.chunkCount} ${job.progress.unit}s; ${job.penLifted ? 'pen lifted' : "couldn't lift the pen"}.`
                  : `Failed after ${job.progress.chunksSent} of ${job.progress.chunkCount} ${job.progress.unit}s: ${job.error}`}
          </ThemedText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  progress: {
    gap: 6,
  },
  track: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
  small: {
    fontSize: 13,
    lineHeight: 18,
  },
});
