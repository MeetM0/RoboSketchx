import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Row, Section } from '@/components/ui/list';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { Space } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useRobot } from '@/lib/robot/robot-context';

const isWeb = process.env.EXPO_OS === 'web';

/**
 * Starts connecting from wherever the person is. On web the browser's own device chooser is
 * the list; on phones a sheet lists robots as they're found.
 */
export function useConnectRobot() {
  const robot = useRobot();
  const [open, setOpen] = useState(false);

  // Close once connected.
  useEffect(() => {
    if (open && robot.status === 'connected') setOpen(false);
  }, [open, robot.status]);

  const connect = () => {
    robot.startScan();
    if (!isWeb) setOpen(true);
  };

  const close = () => {
    robot.stopScan();
    setOpen(false);
  };

  return {
    connect,
    sheet: <ConnectSheet visible={open} onClose={close} onRetry={robot.startScan} />,
  };
}

function ConnectSheet({
  visible,
  onClose,
  onRetry,
}: {
  visible: boolean;
  onClose: () => void;
  onRetry: () => void;
}) {
  const colors = useTheme();
  const robot = useRobot();
  const found = [...robot.found].sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999));
  const busy = robot.status === 'scanning' || robot.status === 'connecting';

  return (
    <Sheet
      visible={visible}
      title="Connect robot"
      description="Turn the robot on and keep it within a few metres."
      onClose={onClose}>
      {robot.error && <Banner tone="error" message={robot.error} />}
      {found.length > 0 ? (
        <Section inset>
          {found.map((r) => (
            <Row
              key={r.id}
              icon="antenna.radiowaves.left.and.right"
              title={r.name}
              value={r.rssi !== null ? signal(r.rssi) : undefined}
              onPress={() => robot.connect(r.id)}
              accessibilityLabel={`Connect to ${r.name}`}
            />
          ))}
        </Section>
      ) : (
        busy && (
          <View style={styles.searching}>
            <ActivityIndicator color={colors.accent} />
            <Text variant="secondary" tone="secondary">
              {robot.status === 'connecting' ? 'Connecting…' : 'Looking for robots…'}
            </Text>
          </View>
        )
      )}
      {robot.status === 'connecting' && found.length > 0 && (
        <Text variant="caption" tone="secondary">
          Connecting…
        </Text>
      )}
      {!busy && (
        <Button
          title={found.length ? 'Search again' : 'Search for robots'}
          variant={found.length ? 'secondary' : 'primary'}
          onPress={onRetry}
        />
      )}
    </Sheet>
  );
}

const signal = (rssi: number) => (rssi > -60 ? 'Strong' : rssi > -80 ? 'Good' : 'Weak');

const styles = StyleSheet.create({
  searching: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.md,
  },
});
