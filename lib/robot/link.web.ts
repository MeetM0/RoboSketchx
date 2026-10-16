import type { RobotConnection, RobotLink } from './link-types';
import { bytesToText, type RobotSettings } from './protocol';

// Minimal Web Bluetooth typings (not part of TypeScript's DOM library yet).
type WebCharacteristic = EventTarget & {
  value: DataView | null;
  writeValueWithResponse?(value: Uint8Array): Promise<void>;
  writeValue(value: Uint8Array): Promise<void>;
  startNotifications(): Promise<WebCharacteristic>;
};
type WebDevice = EventTarget & {
  id: string;
  name?: string;
  gatt?: {
    connected: boolean;
    connect(): Promise<{
      getPrimaryService(uuid: string): Promise<{
        getCharacteristic(uuid: string): Promise<WebCharacteristic>;
      }>;
    }>;
    disconnect(): void;
  };
};
type WebBluetooth = {
  requestDevice(options: {
    acceptAllDevices?: boolean;
    optionalServices?: string[];
  }): Promise<WebDevice>;
};

const bluetooth = () =>
  typeof navigator === 'undefined'
    ? undefined
    : (navigator as Navigator & { bluetooth?: WebBluetooth }).bluetooth;

/** Devices the person picked in the browser chooser, by id, so `connect` can find them. */
const picked = new Map<string, WebDevice>();

export const robotLink: RobotLink = {
  async unavailableReason() {
    if (!bluetooth()) {
      return (
        "This browser can't use Bluetooth. Open RoboSketch in Chrome or Edge " +
        '(desktop or Android), or use the phone app.'
      );
    }
    return null;
  },

  scan(settings, onFound, onError) {
    // The browser shows its own device chooser; it must be opened straight from a tap.
    bluetooth()
      ?.requestDevice({ acceptAllDevices: true, optionalServices: [settings.serviceUUID] })
      .then((device) => {
        picked.set(device.id, device);
        onFound({ id: device.id, name: device.name || 'Unnamed device', rssi: null });
      })
      .catch((e: Error) => {
        // Closing the chooser without picking isn't an error worth showing.
        if (e?.name !== 'NotFoundError') onError(e);
      });
    return () => {};
  },

  async connect(id, settings) {
    const device = picked.get(id);
    if (!device?.gatt) throw new Error('Pick the robot again from the device list.');
    const server = await device.gatt.connect();
    try {
      const service = await server.getPrimaryService(settings.serviceUUID).catch(() => {
        throw new Error(
          `This device doesn't have the robot service (${settings.serviceUUID}). ` +
            'Check the UUIDs in the Robot settings.'
        );
      });
      const rx = await service.getCharacteristic(settings.rxCharacteristicUUID);
      const tx = await service.getCharacteristic(settings.txCharacteristicUUID).catch(() => null);
      return makeConnection(device, settings, rx, tx);
    } catch (e) {
      device.gatt.disconnect();
      throw e;
    }
  },
};

async function makeConnection(
  device: WebDevice,
  settings: RobotSettings,
  rx: WebCharacteristic,
  tx: WebCharacteristic | null
): Promise<RobotConnection> {
  const textListeners = new Set<(text: string) => void>();
  if (tx) {
    tx.addEventListener('characteristicvaluechanged', () => {
      if (!tx.value) return;
      const bytes = new Uint8Array(tx.value.buffer, tx.value.byteOffset, tx.value.byteLength);
      const text = bytesToText(bytes);
      textListeners.forEach((listener) => listener(text));
    });
    await tx.startNotifications();
  }

  return {
    id: device.id,
    name: device.name || 'Robot',
    // Browsers negotiate the MTU themselves and don't expose it; writes larger than the real
    // MTU are sent as BLE "long writes", which the firmware must accept.
    mtu: settings.mtu,
    mtuKnown: false,
    async write(bytes) {
      if (rx.writeValueWithResponse) await rx.writeValueWithResponse(bytes);
      else await rx.writeValue(bytes);
    },
    onText(listener) {
      textListeners.add(listener);
      return () => textListeners.delete(listener);
    },
    async disconnect() {
      device.gatt?.disconnect();
    },
    onDisconnect(listener) {
      const handler = () => listener();
      device.addEventListener('gattserverdisconnected', handler);
      return () => device.removeEventListener('gattserverdisconnected', handler);
    },
  };
}
