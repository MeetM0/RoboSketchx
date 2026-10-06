import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { NumberField, Section, TextField } from '@/components/form-fields';
import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ATT_HEADER_BYTES, type AckMode } from '@/lib/robot/protocol';
import { useRobot } from '@/lib/robot/robot-context';

const ACK_OPTIONS = [
  { value: 'grbl', label: 'GRBL' },
  { value: 'line', label: '"ok"/line' },
  { value: 'chunk', label: '"ok"/chunk' },
  { value: 'none', label: 'None' },
] as const satisfies readonly { value: AckMode; label: string }[];

/** Find / connect / disconnect the robot over Bluetooth, plus its BLE settings. */
export function RobotPanel() {
  const colors = Colors[useColorScheme() ?? 'light'];
  const robot = useRobot();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { settings, updateSettings } = robot;

  return (
    <Section
      title="Robot"
      hint={`Sends G-code over Bluetooth LE in chunks of up to ${settings.mtu - ATT_HEADER_BYTES} bytes (MTU ${settings.mtu}).`}>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.statusRow}>
          <IconSymbol
            name="antenna.radiowaves.left.and.right"
            size={22}
            color={robot.status === 'connected' ? colors.tint : colors.icon}
          />
          <View style={styles.statusText}>
            <ThemedText type="defaultSemiBold">
              {robot.status === 'connected' && robot.robot
                ? robot.robot.name
                : robot.status === 'connecting'
                  ? 'Connecting…'
                  : robot.status === 'scanning'
                    ? 'Looking for robots…'
                    : 'Not connected'}
            </ThemedText>
            {robot.robot && (
              <ThemedText style={[styles.small, { color: colors.icon }]}>
                {robot.robot.mtuKnown
                  ? `MTU ${robot.robot.mtu} · ${robot.robot.payloadBytes}-byte chunks`
                  : `${robot.robot.payloadBytes}-byte chunks · MTU set by the browser`}
              </ThemedText>
            )}
          </View>
          {(robot.status === 'scanning' || robot.status === 'connecting') && (
            <ActivityIndicator color={colors.tint} />
          )}
        </View>

        {robot.robot && robot.robot.mtuKnown && robot.robot.mtu < settings.mtu && (
          <ThemedText style={[styles.small, styles.warning]}>
            The robot accepted MTU {robot.robot.mtu}, less than the {settings.mtu} requested, so
            chunks are smaller.
          </ThemedText>
        )}

        {robot.status === 'connected' ? (
          <View style={styles.row}>
            <Button title="Disconnect" variant="secondary" onPress={robot.disconnect} />
          </View>
        ) : robot.status === 'scanning' ? (
          <View style={styles.row}>
            <Button title="Stop" variant="secondary" onPress={robot.stopScan} />
          </View>
        ) : (
          <View style={styles.row}>
            <Button
              title="Find robots"
              icon="antenna.radiowaves.left.and.right"
              disabled={robot.status === 'connecting'}
              onPress={robot.startScan}
            />
          </View>
        )}

        {robot.status !== 'connected' &&
          [...robot.found]
            .sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999))
            .map((found) => (
              <Pressable
                key={found.id}
                accessibilityRole="button"
                accessibilityLabel={`Connect to ${found.name}`}
                disabled={robot.status === 'connecting'}
                onPress={() => robot.connect(found.id)}
                style={({ pressed }) => [
                  styles.device,
                  { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
                ]}>
                <ThemedText style={styles.deviceName}>{found.name}</ThemedText>
                {found.rssi !== null && (
                  <ThemedText style={[styles.small, { color: colors.icon }]}>
                    {found.rssi} dBm
                  </ThemedText>
                )}
              </Pressable>
            ))}

        {robot.error && <ThemedText style={[styles.small, styles.error]}>{robot.error}</ThemedText>}

        {robot.log.length > 0 && (
          <View style={[styles.log, { borderColor: colors.border }]}>
            {robot.log.slice(-6).map((line, i) => (
              <ThemedText key={`${i}-${line}`} style={[styles.logLine, { color: colors.icon }]}>
                {line}
              </ThemedText>
            ))}
          </View>
        )}
      </View>

      <Pressable accessibilityRole="button" onPress={() => setShowAdvanced((v) => !v)}>
        <ThemedText type="link">
          {showAdvanced ? 'Hide Bluetooth settings' : 'Bluetooth settings'}
        </ThemedText>
      </Pressable>

      {showAdvanced && (
        <View style={styles.advanced}>
          <View style={styles.row}>
            <NumberField
              label="MTU"
              unit="bytes"
              value={settings.mtu}
              min={23}
              max={517}
              onCommit={(mtu) => updateSettings({ mtu: Math.round(mtu) })}
            />
            <NumberField
              label="Reply timeout"
              unit="s"
              value={settings.ackTimeoutMs / 1000}
              min={1}
              max={600}
              onCommit={(s) => updateSettings({ ackTimeoutMs: Math.round(s * 1000) })}
            />
          </View>
          <ThemedText type="defaultSemiBold">Flow control</ThemedText>
          <SegmentedControl
            options={ACK_OPTIONS}
            value={settings.ackMode}
            onChange={(ackMode) => updateSettings({ ackMode })}
          />
          <ThemedText style={[styles.small, { color: colors.icon }]}>
            {settings.ackMode === 'grbl'
              ? 'GRBL character counting: only sends while the controller\'s receive buffer has room; each "ok" frees a line.'
              : settings.ackMode === 'none'
                ? 'No flow control: only safe if your firmware buffers the whole job. A Bluetooth write acknowledgement does not mean the controller has room.'
                : 'Waits for "ok" replies between Bluetooth chunks. Each chunk can still be larger than a small controller buffer.'}
          </ThemedText>
          {settings.ackMode === 'grbl' && (
            <View style={styles.row}>
              <NumberField
                label="Controller RX buffer"
                unit="bytes"
                value={settings.rxBufferBytes}
                min={16}
                max={65536}
                onCommit={(n) => updateSettings({ rxBufferBytes: Math.round(n) })}
              />
            </View>
          )}
          {settings.ackMode !== 'none' && (
            <TextField
              label="Reply that means OK"
              value={settings.ackToken}
              autoCapitalize="none"
              onCommit={(ackToken) => updateSettings({ ackToken })}
            />
          )}
          <TextField
            label="Service UUID"
            value={settings.serviceUUID}
            autoCapitalize="none"
            onCommit={(serviceUUID) => updateSettings({ serviceUUID: serviceUUID.toLowerCase() })}
          />
          <TextField
            label="RX characteristic (app writes G-code)"
            value={settings.rxCharacteristicUUID}
            autoCapitalize="none"
            onCommit={(uuid) => updateSettings({ rxCharacteristicUUID: uuid.toLowerCase() })}
          />
          <TextField
            label="TX characteristic (robot replies)"
            value={settings.txCharacteristicUUID}
            autoCapitalize="none"
            onCommit={(uuid) => updateSettings({ txCharacteristicUUID: uuid.toLowerCase() })}
          />
          <ThemedText style={[styles.small, { color: colors.icon }]}>
            Defaults are the Nordic UART Service used by most ESP32 / nRF serial-over-BLE firmware.
            Changes apply the next time you connect.
          </ThemedText>
          <View style={styles.row}>
            <Button
              title="Reset Bluetooth settings"
              icon="arrow.counterclockwise"
              variant="secondary"
              onPress={robot.resetSettings}
            />
          </View>
        </View>
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusText: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  device: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 10,
  },
  deviceName: {
    flex: 1,
  },
  log: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  logLine: {
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'monospace',
  },
  small: {
    fontSize: 13,
    lineHeight: 18,
  },
  advanced: {
    gap: 10,
  },
  warning: {
    color: '#B26A00',
  },
  error: {
    color: '#D93025',
  },
});
