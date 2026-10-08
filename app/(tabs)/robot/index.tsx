import { useRouter } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';

import { useConnectRobot } from '@/components/robot/connect';
import {
  describeJob,
  describeRobot,
  jobFraction,
  paperName,
} from '@/components/robot/status';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Row, Section } from '@/components/ui/list';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { Radius, Space } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePlotterSettings } from '@/lib/plotter-settings';
import { useRobot } from '@/lib/robot/robot-context';

/** Robot overview: connection, the current job, setup and recent activity. */
export default function RobotScreen() {
  const router = useRouter();
  const robot = useRobot();
  const { settings, resetSettings } = usePlotterSettings();
  const { connect, sheet } = useConnectRobot();
  const r = robot.settings;
  // Connection events and errors; routine "ok" replies would push them out of view.
  const activity = robot.log.filter((line) => line !== '← ok').slice(-8);
  const orientation = settings.paperWidthMm > settings.paperHeightMm ? 'landscape' : 'portrait';

  function confirmReset() {
    const message =
      'Paper, pen and motion settings go back to their defaults. Connection settings are kept.';
    if (process.env.EXPO_OS === 'web') {
      if (window.confirm(`Reset drawing settings?\n\n${message}`)) resetSettings();
      return;
    }
    Alert.alert('Reset drawing settings?', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: resetSettings },
    ]);
  }

  return (
    <Screen title="Robot">
      <ConnectionCard onConnect={connect} />
      {sheet}

      <Section
        title="Setup"
        description="Match these to your machine so drawings come out the right size.">
        <Section inset>
          <Row
            icon="doc.text"
            title="Paper"
            value={`${paperName(settings)} ${orientation}`}
            onPress={() => router.push('/robot/paper')}
          />
          <Row
            icon="pencil.and.outline"
            title="Pen"
            value={settings.penMode === 'z' ? 'Z axis' : 'Custom commands'}
            onPress={() => router.push('/robot/pen')}
          />
          <Row
            icon="arrow.counterclockwise"
            title="Motion"
            value={`${settings.drawFeedRate} mm/min`}
            onPress={() => router.push('/robot/motion')}
          />
          <Row
            icon="antenna.radiowaves.left.and.right"
            title="Connection"
            value={r.firmware === 'grbl' ? 'GRBL' : 'Custom firmware'}
            onPress={() => router.push('/robot/connection')}
          />
        </Section>
      </Section>

      {activity.length > 0 && (
        <Section title="Activity">
          <ActivityLog lines={activity} />
        </Section>
      )}

      <View style={styles.start}>
        <Button
          title="Reset drawing settings"
          variant="tertiary"
          size="sm"
          onPress={confirmReset}
        />
      </View>
    </Screen>
  );
}

function ConnectionCard({ onConnect }: { onConnect: () => void }) {
  const colors = useTheme();
  const robot = useRobot();
  const connected = robot.status === 'connected' && !!robot.robot;
  const { label } = describeRobot(robot.status, robot.robot?.name ?? null, null);
  const job = robot.job;
  const outcome = job ? describeJob(job) : null;
  const busy = robot.status === 'scanning' || robot.status === 'connecting';

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <View
          style={[
            styles.cardIcon,
            {
              backgroundColor: connected ? colors.successSubtle : colors.surfaceMuted,
            },
          ]}>
          <IconSymbol
            name="antenna.radiowaves.left.and.right"
            size={22}
            color={connected ? colors.success : colors.textSecondary}
          />
        </View>
        <View style={styles.grow}>
          <Text variant="bodyStrong">{label}</Text>
          <Text variant="caption" tone="secondary">
            {connected && robot.robot
              ? robot.robot.mtuKnown
                ? `Bluetooth LE · ${robot.robot.payloadBytes}-byte packets (MTU ${robot.robot.mtu})`
                : `Bluetooth LE · ${robot.robot.payloadBytes}-byte packets`
              : 'Connect over Bluetooth to send drawings.'}
          </Text>
        </View>
      </View>

      {robot.error && <Banner tone="error" message={robot.error} />}
      {connected && robot.robot?.mtuKnown && robot.robot.mtu < robot.settings.mtu && (
        <Banner
          tone="info"
          message={`The robot accepted MTU ${robot.robot.mtu} instead of ${robot.settings.mtu}, so packets are smaller. Sending still works.`}
        />
      )}

      {job?.state === 'sending' && (
        <View style={styles.job}>
          <View style={styles.jobLine}>
            <Text variant="label">Sending drawing</Text>
            <Text variant="label" tone="secondary">
              {Math.round(jobFraction(job) * 100)}%
            </Text>
          </View>
          <ProgressBar value={jobFraction(job)} label="Sending progress" />
          <Text variant="caption" tone="secondary">
            {job.progress.chunksSent.toLocaleString()} of {job.progress.chunkCount.toLocaleString()}{' '}
            {job.progress.unit}s
          </Text>
        </View>
      )}
      {outcome && (
        <Banner
          tone={outcome.tone}
          title={outcome.title}
          message={outcome.message}
          actionLabel="Dismiss"
          onAction={robot.dismissJob}
        />
      )}

      <View style={styles.actions}>
        {job?.state === 'sending' ? (
          <Button title="Stop" icon="stop.fill" variant="destructive" onPress={robot.cancel} />
        ) : connected ? (
          <Button title="Disconnect" variant="secondary" onPress={robot.disconnect} />
        ) : (
          <Button
            title={
              busy
                ? robot.status === 'connecting'
                  ? 'Connecting…'
                  : 'Searching…'
                : 'Connect robot'
            }
            icon="antenna.radiowaves.left.and.right"
            loading={busy}
            onPress={onConnect}
          />
        )}
      </View>
    </View>
  );
}

function ActivityLog({ lines }: { lines: string[] }) {
  const colors = useTheme();
  return (
    <View style={[styles.log, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {lines.map((line, i) => (
        <Text key={`${i}-${line}`} variant="mono" tone="secondary" selectable>
          {line}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Space.lg,
    padding: Space.lg,
    borderWidth: 1,
    borderRadius: Radius.card,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grow: {
    flex: 1,
    gap: 2,
  },
  job: {
    gap: Space.sm,
  },
  jobLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actions: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  log: {
    gap: 2,
    padding: Space.md,
    borderWidth: 1,
    borderRadius: Radius.card,
  },
  start: {
    flexDirection: 'row',
  },
});
