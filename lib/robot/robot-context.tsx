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
import { chunkPayload, DEFAULT_ROBOT_SETTINGS, type RobotSettings } from './protocol';
import { recoverOnConnect, runJob } from './job';
import { type SendProgress } from './sender';
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
  /** Hides the last job's outcome (not while sending). */
  dismissJob: () => void;
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
  // Set when the link drops (or the person disconnects) during a job.
  const disconnectedRef = useRef(false);
  // Pen-up line of a job that was interrupted; the robot is stopped on the next connection.
  const pendingStopRef = useRef<string | null>(null);

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
          disconnectedRef.current = true;
          forgetConnection();
        }),
      ];
      setRobot({
        name: connection.name,
        mtu: connection.mtu,
        mtuKnown: connection.mtuKnown,
        payloadBytes: chunkPayload(settings, connection),
      });
      disconnectedRef.current = false;
      const payload = chunkPayload(settings, connection);
      const mtuText = connection.mtuKnown ? `negotiated MTU ${connection.mtu}` : 'MTU not reported';
      console.info(`[robot] ${connection.name}: ${mtuText}, ${payload}-byte writes`);
      addLog(`Connected to ${connection.name} (${mtuText}, ${payload}-byte writes)`);
      // A job was interrupted: the robot may still be moving with the pen down. Stop it before
      // anything else; the job itself is never resumed.
      if (pendingStopRef.current) {
        const steps = await recoverOnConnect(connection, true, {
          firmware: settings.firmware,
          stopCommand: settings.stopCommand,
          penUpLine: pendingStopRef.current,
        });
        pendingStopRef.current = null;
        addLog(`Recovered interrupted job: ${steps.join(' → ')}`);
      }
      setStatus('connected');
    } catch (e) {
      forgetConnection();
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function disconnect() {
    disconnectedRef.current = true;
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
    disconnectedRef.current = false;
    const empty: SendProgress = {
      unit: settings.ackMode === 'grbl' ? 'line' : 'chunk',
      chunksSent: 0,
      chunkCount: 0,
      bytesSent: 0,
      byteCount: 0,
    };
    setJob({ state: 'sending', progress: empty });
    const result = await runJob(connection, gcode, {
      send: {
        payloadBytes: robot.payloadBytes,
        ackMode: settings.ackMode,
        ackToken: settings.ackToken,
        ackTimeoutMs: settings.ackTimeoutMs,
        rxBufferBytes: settings.rxBufferBytes,
      },
      userCancelled: () => cancelRef.current,
      disconnected: () => disconnectedRef.current,
      onProgress: (progress) => setJob({ state: 'sending', progress }),
    });
    const { progress } = result;
    if (result.state === 'done') {
      setJob({ state: 'done', progress });
      addLog(`Sent ${progress.chunkCount} ${progress.unit}s (${progress.byteCount} bytes)`);
      return;
    }
    // Cancelled or failed: the controller may still be drawing what it has buffered. Halt it,
    // discard its queue and lift the pen — now if still connected, else on reconnect.
    let lifted = false;
    if (connectionRef.current && !disconnectedRef.current) {
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
    if (!lifted) pendingStopRef.current = penUpCommand;
    if (result.state === 'cancelled') {
      setJob({ state: 'cancelled', progress, penLifted: lifted });
      addLog(lifted ? 'Sending cancelled; pen lifted' : 'Sending cancelled; could not lift pen');
    } else {
      setJob({ state: 'failed', progress, error: result.error });
      addLog(`Sending failed: ${result.error}`);
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
        dismissJob: () => setJob((current) => (current?.state === 'sending' ? current : null)),
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
