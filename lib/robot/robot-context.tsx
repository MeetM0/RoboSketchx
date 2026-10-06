import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import { robotLink } from './link';
import type { FoundRobot, RobotConnection } from './link-types';
import { DEFAULT_ROBOT_SETTINGS, payloadSize, type RobotSettings } from './protocol';
import { SendCancelled, sendGcode, type SendProgress } from './sender';
import { stopRobot } from './stop';

const STORAGE_KEY = 'robosketch.robotSettings.v1';
const SCAN_DURATION_MS = 12_000;
const LOG_LINES = 40;

export type RobotStatus = 'disconnected' | 'scanning' | 'connecting' | 'connected';

export type SendJob = {
  state: 'sending' | 'done' | 'cancelled' | 'failed';
  progress: SendProgress;
  error?: string;
  /** For cancelled jobs: whether the pen-up command reached the robot. */
  penLifted?: boolean;
};

type RobotContextValue = {
  settings: RobotSettings;
  updateSettings: (patch: Partial<RobotSettings>) => void;
  resetSettings: () => void;
  status: RobotStatus;
  found: FoundRobot[];
  robot: { name: string; mtu: number; mtuKnown: boolean; payloadBytes: number } | null;
  /** Recent replies from the robot and connection events, oldest first. */
  log: string[];
  job: SendJob | null;
  error: string | null;
  startScan: () => void;
  stopScan: () => void;
  connect: (id: string) => Promise<void>;
  disconnect: () => Promise<void>;
  /** Sends G-code; `penUpCommand` is sent if the job is cancelled so the pen doesn't drag. */
  send: (gcode: string, penUpCommand: string) => Promise<void>;
  cancel: () => void;
};

const RobotContext = createContext<RobotContextValue | null>(null);

export function RobotProvider({ children }: PropsWithChildren) {
  const [settings, setSettings] = useState<RobotSettings>(DEFAULT_ROBOT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<RobotStatus>('disconnected');
  const [found, setFound] = useState<FoundRobot[]>([]);
  const [robot, setRobot] = useState<RobotContextValue['robot']>(null);
  const [log, setLog] = useState<string[]>([]);
  const [job, setJob] = useState<SendJob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connectionRef = useRef<RobotConnection | null>(null);
  const cleanupRef = useRef<(() => void)[]>([]);
  const stopScanRef = useRef<(() => void) | null>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored) setSettings({ ...DEFAULT_ROBOT_SETTINGS, ...JSON.parse(stored) });
      })
      .catch((e) => console.warn('Could not load robot settings', e))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings)).catch((e) =>
      console.warn('Could not save robot settings', e)
    );
  }, [loaded, settings]);

  // Drop the connection if the app unmounts the provider.
  useEffect(
    () => () => {
      stopScanRef.current?.();
      connectionRef.current?.disconnect();
    },
    []
  );

  const addLog = (line: string) => setLog((current) => [...current, line].slice(-LOG_LINES));

  function stopScan() {
    stopScanRef.current?.();
    stopScanRef.current = null;
    setStatus((s) => (s === 'scanning' ? 'disconnected' : s));
  }

  function startScan() {
    setError(null);
    setFound([]);
    // On web the device chooser must open synchronously inside the tap, so scan first and
    // check availability in parallel.
    setStatus('scanning');
    const stop = robotLink.scan(
      settings,
      (robotFound) => {
        // On web the browser's chooser already was the choice, so connect straight away.
        if (process.env.EXPO_OS === 'web') {
          connect(robotFound.id);
          return;
        }
        setFound((current) =>
          current.some((r) => r.id === robotFound.id)
            ? current.map((r) => (r.id === robotFound.id ? robotFound : r))
            : [...current, robotFound]
        );
      },
      (e) => {
        setError(e.message);
        stopScan();
      }
    );
    const timer = setTimeout(stopScan, SCAN_DURATION_MS);
    stopScanRef.current = () => {
      clearTimeout(timer);
      stop();
    };
    robotLink.unavailableReason().then((reason) => {
      if (reason) {
        setError(reason);
        stopScan();
      }
    });
  }

  function forgetConnection() {
    cleanupRef.current.splice(0).forEach((cleanup) => cleanup());
    connectionRef.current = null;
    setRobot(null);
    setStatus('disconnected');
  }

  async function connect(id: string) {
    stopScan();
    setError(null);
    setStatus('connecting');
    try {
      const reason = await robotLink.unavailableReason();
      if (reason) throw new Error(reason);
      const connection = await robotLink.connect(id, settings);
      connectionRef.current = connection;
      const replyBuffer = { text: '' };
      cleanupRef.current = [
        connection.onText((text) => {
          // Log whole lines; keep a partial line until its newline arrives.
          replyBuffer.text += text;
          const lines = replyBuffer.text.split(/\r?\n/);
          replyBuffer.text = lines.pop() ?? '';
          lines.filter((l) => l.trim()).forEach((l) => addLog(`← ${l.trim()}`));
        }),
        connection.onDisconnect(() => {
          addLog('Robot disconnected');
          cancelRef.current = true;
          forgetConnection();
        }),
      ];
      setRobot({
        name: connection.name,
        mtu: connection.mtu,
        mtuKnown: connection.mtuKnown,
        payloadBytes: payloadSize(settings.mtu, connection.mtu),
      });
      setStatus('connected');
      addLog(`Connected to ${connection.name} (MTU ${connection.mtu})`);
    } catch (e) {
      forgetConnection();
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function disconnect() {
    cancelRef.current = true;
    const connection = connectionRef.current;
    forgetConnection();
    await connection?.disconnect();
    addLog('Disconnected');
  }

  async function send(gcode: string, penUpCommand: string) {
    const connection = connectionRef.current;
    if (!connection || !robot) {
      setError('Connect to your robot first.');
      return;
    }
    setError(null);
    cancelRef.current = false;
    const empty: SendProgress = {
      unit: settings.ackMode === 'grbl' ? 'line' : 'chunk',
      chunksSent: 0,
      chunkCount: 0,
      bytesSent: 0,
      byteCount: 0,
    };
    setJob({ state: 'sending', progress: empty });
    let last = empty;
    try {
      last = await sendGcode(connection, gcode, {
        payloadBytes: robot.payloadBytes,
        ackMode: settings.ackMode,
        ackToken: settings.ackToken,
        ackTimeoutMs: settings.ackTimeoutMs,
        rxBufferBytes: settings.rxBufferBytes,
        isCancelled: () => cancelRef.current,
        onProgress: (progress) => {
          last = progress;
          setJob({ state: 'sending', progress });
        },
      });
      setJob({ state: 'done', progress: last });
      addLog(`Sent ${last.chunkCount} chunks (${last.byteCount} bytes)`);
    } catch (e) {
      if (e instanceof SendCancelled) {
        // Stopping the sender isn't enough: the controller would keep drawing what it has
        // buffered. Halt it, discard its queue and lift the pen.
        let lifted = false;
        if (connectionRef.current) {
          lifted = await stopRobot(connectionRef.current, {
            firmware: settings.firmware,
            stopCommand: settings.stopCommand,
            penUpLine: penUpCommand,
          })
            .then((steps) => {
              addLog(`Stopped: ${steps.join(' → ')}`);
              return true;
            })
            .catch(() => false);
        }
        setJob({ state: 'cancelled', progress: last, penLifted: lifted });
        addLog(lifted ? 'Sending cancelled; pen lifted' : 'Sending cancelled; could not lift pen');
      } else {
        const message = e instanceof Error ? e.message : String(e);
        setJob({ state: 'failed', progress: last, error: message });
        addLog(`Sending failed: ${message}`);
      }
    }
  }

  return (
    <RobotContext.Provider
      value={{
        settings,
        updateSettings: (patch) => setSettings((current) => ({ ...current, ...patch })),
        resetSettings: () => setSettings(DEFAULT_ROBOT_SETTINGS),
        status,
        found,
        robot,
        log,
        job,
        error,
        startScan,
        stopScan,
        connect,
        disconnect,
        send,
        cancel: () => {
          cancelRef.current = true;
        },
      }}>
      {children}
    </RobotContext.Provider>
  );
}

export function useRobot() {
  const value = useContext(RobotContext);
  if (!value) throw new Error('useRobot must be used inside RobotProvider');
  return value;
}
