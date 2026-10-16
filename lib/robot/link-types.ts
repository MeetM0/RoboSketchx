import type { RobotSettings } from './protocol';
import type { RobotTransport } from './sender';

export type FoundRobot = {
  id: string;
  name: string;
  /** Signal strength in dBm (closer to 0 = nearer); null when unknown (web). */
  rssi: number | null;
};

export type RobotConnection = RobotTransport & {
  id: string;
  name: string;
  /** ATT MTU in use for this connection. */
  mtu: number;
  /** True when `mtu` was reported by the platform; false when it's assumed (web). */
  mtuKnown: boolean;
  disconnect(): Promise<void>;
  /** Called once if the robot drops the connection; returns an unsubscribe function. */
  onDisconnect(listener: () => void): () => void;
};

/** Platform Bluetooth access: native BLE on iOS / Android, Web Bluetooth in the browser. */
export type RobotLink = {
  /** Null when Bluetooth can be used, otherwise a sentence explaining why not. */
  unavailableReason(): Promise<string | null>;
  /**
   * Looks for robots, reporting each one found. Returns a function that stops the scan.
   * On web this opens the browser's device chooser and must be called from a tap.
   */
  scan(
    settings: RobotSettings,
    onFound: (robot: FoundRobot) => void,
    onError: (error: Error) => void
  ): () => void;
  connect(id: string, settings: RobotSettings): Promise<RobotConnection>;
};
