import Constants, { ExecutionEnvironment } from 'expo-constants';
import { PermissionsAndroid, Platform } from 'react-native';
import { BleManager, State, type Device } from 'react-native-ble-plx';

import { base64ToBytes } from '../sketch';
import type { RobotConnection, RobotLink } from './link-types';
import { bytesToBase64, bytesToText, type RobotSettings } from './protocol';

let manager: BleManager | null = null;

/** Created on first use: constructing it in Expo Go (no native module) would crash. */
function getManager(): BleManager {
  manager ??= new BleManager();
  return manager;
}

const sameUuid = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

async function requestAndroidPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const permissions =
    Number(Platform.Version) >= 31
      ? [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  const results = await PermissionsAndroid.requestMultiple(permissions);
  return permissions.every((p) => results[p] === PermissionsAndroid.RESULTS.GRANTED);
}

/** Bluetooth state, waiting briefly for iOS to report it after start-up. */
async function bluetoothState(): Promise<State> {
  const ble = getManager();
  const state = await ble.state();
  if (state !== State.Unknown && state !== State.Resetting) return state;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      subscription.remove();
      resolve(state);
    }, 3000);
    const subscription = ble.onStateChange((next) => {
      if (next === State.Unknown || next === State.Resetting) return;
      clearTimeout(timer);
      subscription.remove();
      resolve(next);
    }, true);
  });
}

export const robotLink: RobotLink = {
  async unavailableReason() {
    if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
      return 'Bluetooth needs a development build of RoboSketch; it is not available in Expo Go.';
    }
    try {
      if (!(await requestAndroidPermissions())) {
        return 'Bluetooth permission was refused. Allow "Nearby devices" for RoboSketch in Settings.';
      }
      switch (await bluetoothState()) {
        case State.PoweredOn:
          return null;
        case State.PoweredOff:
          return 'Bluetooth is turned off. Turn it on to connect to your robot.';
        case State.Unauthorized:
          return 'RoboSketch is not allowed to use Bluetooth. Allow it in Settings.';
        case State.Unsupported:
          return "This device doesn't support Bluetooth Low Energy.";
        default:
          return 'Bluetooth is not ready yet. Try again in a moment.';
      }
    } catch (e) {
      return `Bluetooth is unavailable: ${e instanceof Error ? e.message : String(e)}`;
    }
  },

  scan(_settings, onFound, onError) {
    const ble = getManager();
    // Scan everything: plenty of robot firmware doesn't advertise its service UUID.
    ble
      .startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
        if (error) {
          onError(new Error(error.message));
          return;
        }
        const name = device?.name ?? device?.localName;
        if (device && name) onFound({ id: device.id, name, rssi: device.rssi });
      })
      .catch((e) => onError(e instanceof Error ? e : new Error(String(e))));
    return () => {
      ble.stopDeviceScan().catch(() => {});
    };
  },

  async connect(id, settings) {
    const ble = getManager();
    await ble.stopDeviceScan().catch(() => {});
    // Android negotiates the MTU here; iOS negotiates automatically and ignores the request.
    let device: Device = await ble.connectToDevice(id, { requestMTU: settings.mtu });
    try {
      device = await device.discoverAllServicesAndCharacteristics();
      const service = (await device.services()).find((s) => sameUuid(s.uuid, settings.serviceUUID));
      if (!service) {
        throw new Error(
          `This device doesn't have the robot service (${settings.serviceUUID}). ` +
            'Check the UUIDs in the Robot settings.'
        );
      }
      const characteristics = await service.characteristics();
      if (!characteristics.some((c) => sameUuid(c.uuid, settings.rxCharacteristicUUID))) {
        throw new Error(`The robot has no RX characteristic ${settings.rxCharacteristicUUID}.`);
      }
      const hasTx = characteristics.some((c) => sameUuid(c.uuid, settings.txCharacteristicUUID));
      return makeConnection(ble, device, settings, hasTx);
    } catch (e) {
      await ble.cancelDeviceConnection(id).catch(() => {});
      throw e;
    }
  },
};

function makeConnection(
  ble: BleManager,
  device: Device,
  settings: RobotSettings,
  hasTx: boolean
): RobotConnection {
  const textListeners = new Set<(text: string) => void>();
  const monitor = hasTx
    ? ble.monitorCharacteristicForDevice(
        device.id,
        settings.serviceUUID,
        settings.txCharacteristicUUID,
        (error, characteristic) => {
          if (error || !characteristic?.value) return;
          const text = bytesToText(base64ToBytes(characteristic.value));
          textListeners.forEach((listener) => listener(text));
        }
      )
    : null;

  return {
    id: device.id,
    name: device.name ?? device.localName ?? 'Robot',
    mtu: device.mtu,
    mtuKnown: true,
    async write(bytes) {
      await ble.writeCharacteristicWithResponseForDevice(
        device.id,
        settings.serviceUUID,
        settings.rxCharacteristicUUID,
        bytesToBase64(bytes)
      );
    },
    onText(listener) {
      textListeners.add(listener);
      return () => textListeners.delete(listener);
    },
    async disconnect() {
      monitor?.remove();
      await ble.cancelDeviceConnection(device.id).catch(() => {});
    },
    onDisconnect(listener) {
      const subscription = ble.onDeviceDisconnected(device.id, () => {
        monitor?.remove();
        listener();
      });
      return () => subscription.remove();
    },
  };
}
