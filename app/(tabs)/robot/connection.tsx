import { Alert, StyleSheet, View } from 'react-native';

import { useBackToRobot } from '@/components/robot/use-back';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { FieldRow, NumberField, TextField } from '@/components/ui/field';
import { OptionList, Section } from '@/components/ui/list';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { ATT_HEADER_BYTES, type AckMode } from '@/lib/robot/protocol';
import { useRobot } from '@/lib/robot/robot-context';

const FIRMWARE_OPTIONS = [
  {
    value: 'grbl',
    title: 'GRBL',
    description: 'Stop sends feed hold, soft reset and unlock, then lifts the pen.',
  },
  {
    value: 'custom',
    title: 'Other firmware',
    description: 'Stop sends your stop command (if any), then lifts the pen.',
  },
] as const;

const ACK_OPTIONS = [
  {
    value: 'grbl',
    title: 'Buffer counting (recommended for GRBL)',
    description: 'Only sends while the controller has room; each “ok” frees a line.',
  },
  {
    value: 'line',
    title: 'Wait for “ok” after each line',
    description: 'Slowest, works with most firmware.',
  },
  {
    value: 'chunk',
    title: 'Wait for “ok” after each packet',
    description: 'A packet can hold more than a small controller buffer.',
  },
  {
    value: 'none',
    title: 'No flow control',
    description: 'Only if your firmware buffers the whole drawing.',
  },
] as const satisfies readonly {
  value: AckMode;
  title: string;
  description: string;
}[];

const WEB_WRITE_OPTIONS = [
  { value: 'safe', label: '20-byte writes' },
  { value: 'long', label: 'Long writes' },
] as const;

export default function ConnectionScreen() {
  const back = useBackToRobot();
  const { settings, updateSettings, resetSettings, status } = useRobot();

  function confirmReset() {
    const message = 'Firmware, flow control and Bluetooth settings go back to their defaults.';
    if (process.env.EXPO_OS === 'web') {
      if (window.confirm(`Reset connection settings?\n\n${message}`)) resetSettings();
      return;
    }
    Alert.alert('Reset connection settings?', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: resetSettings },
    ]);
  }

  return (
    <Screen title="Connection" onBack={back}>
      {status === 'connected' && (
        <Banner tone="info" message="Bluetooth changes apply the next time you connect." />
      )}

      <Section title="Firmware">
        <OptionList
          label="Firmware"
          options={FIRMWARE_OPTIONS}
          value={settings.firmware}
          onChange={(firmware) => updateSettings({ firmware })}
        />
        {settings.firmware === 'custom' && (
          <TextField
            label="Stop command"
            helper="Clears the controller’s queue. Leave as is if your firmware has none."
            mono
            value={settings.stopCommand}
            onCommit={(stopCommand) => updateSettings({ stopCommand: stopCommand.trim() })}
          />
        )}
      </Section>

      <Section title="Flow control">
        <OptionList
          label="Flow control"
          options={ACK_OPTIONS}
          value={settings.ackMode}
          onChange={(ackMode) => updateSettings({ ackMode })}
        />
        <FieldRow>
          {settings.ackMode === 'grbl' && (
            <NumberField
              label="Controller buffer"
              unit="bytes"
              value={settings.rxBufferBytes}
              min={16}
              max={65536}
              helper="128 for GRBL on Arduino."
              onCommit={(n) => updateSettings({ rxBufferBytes: Math.round(n) })}
            />
          )}
          <NumberField
            label="Reply timeout"
            unit="s"
            value={settings.ackTimeoutMs / 1000}
            min={1}
            max={600}
            onCommit={(s) => updateSettings({ ackTimeoutMs: Math.round(s * 1000) })}
          />
        </FieldRow>
        {settings.ackMode !== 'none' && (
          <TextField
            label="Reply that means OK"
            mono
            value={settings.ackToken}
            onCommit={(ackToken) => updateSettings({ ackToken })}
          />
        )}
      </Section>

      <Section
        title="Bluetooth"
        footer="Defaults are the Nordic UART Service used by most ESP32 and nRF serial-over-Bluetooth firmware.">
        <FieldRow>
          <NumberField
            label="MTU"
            unit="bytes"
            value={settings.mtu}
            min={23}
            max={517}
            helper={`Packets of up to ${settings.mtu - ATT_HEADER_BYTES} bytes.`}
            onCommit={(mtu) => updateSettings({ mtu: Math.round(mtu) })}
          />
        </FieldRow>
        {process.env.EXPO_OS === 'web' && (
          <>
            <Segmented
              label="Browser writes"
              options={WEB_WRITE_OPTIONS}
              value={settings.webLongWrites ? 'long' : 'safe'}
              onChange={(v) => updateSettings({ webLongWrites: v === 'long' })}
            />
            <Banner
              tone="info"
              message={`Browsers don't report the MTU. 20-byte writes always work; long writes send up to ${settings.mtu - ATT_HEADER_BYTES} bytes and need firmware support.`}
            />
          </>
        )}
        <TextField
          label="Service UUID"
          mono
          value={settings.serviceUUID}
          onCommit={(serviceUUID) => updateSettings({ serviceUUID: serviceUUID.toLowerCase() })}
        />
        <TextField
          label="Write characteristic (G-code to robot)"
          mono
          value={settings.rxCharacteristicUUID}
          onCommit={(uuid) => updateSettings({ rxCharacteristicUUID: uuid.toLowerCase() })}
        />
        <TextField
          label="Notify characteristic (robot replies)"
          mono
          value={settings.txCharacteristicUUID}
          onCommit={(uuid) => updateSettings({ txCharacteristicUUID: uuid.toLowerCase() })}
        />
      </Section>

      <View style={styles.row}>
        <Button
          title="Reset connection settings"
          variant="tertiary"
          size="sm"
          onPress={confirmReset}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
});
