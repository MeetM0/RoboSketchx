/**
 * How G-code travels to the robot over Bluetooth Low Energy.
 *
 * The app writes plain ASCII G-code to the robot's RX characteristic in chunks. Each chunk is at
 * most `MTU − 3` bytes (the ATT header takes 3 bytes of every packet), so with the default
 * MTU of 400 a chunk carries up to 397 bytes. Chunks always end on a line break, so the robot
 * never receives half a command. Anything the robot sends back on its TX characteristic
 * (notifications) is shown in the app and can be used for flow control (see `AckMode`).
 */

/** Bytes of every BLE packet used by the ATT protocol header. */
export const ATT_HEADER_BYTES = 3;

/**
 * Flow control. A BLE write acknowledgement only means the bytes reached the robot's radio,
 * not that the controller has room for them, so real flow control needs the controller's
 * replies:
 * - `grbl`  — GRBL character counting (default): send a line only while all unacknowledged
 *   lines fit in the controller's RX buffer (`rxBufferBytes`); each "ok" frees one line.
 * - `line`  — after each BLE chunk, wait for one ack per G-code line in it.
 * - `chunk` — after each BLE chunk, wait for one ack.
 * - `none`  — no flow control: only for firmware that buffers a whole job.
 */
export type AckMode = 'grbl' | 'line' | 'chunk' | 'none';

export type RobotSettings = {
  /** Controller type; decides how Cancel stops the machine (see stop.ts). */
  firmware: 'grbl' | 'custom';
  /** Custom firmware: command that stops motion and clears its queue, sent on Cancel. */
  stopCommand: string;
  /** ATT MTU to request. The robot may negotiate a smaller one; the smaller value wins. */
  mtu: number;
  serviceUUID: string;
  /** Characteristic the app writes G-code to (robot's receive). */
  rxCharacteristicUUID: string;
  /** Characteristic the robot notifies replies on (robot's transmit). */
  txCharacteristicUUID: string;
  ackMode: AckMode;
  /** Controller serial RX buffer in bytes (GRBL default 128), for `ackMode: 'grbl'`. */
  rxBufferBytes: number;
  /** Reply line that counts as an acknowledgement (case-insensitive). */
  ackToken: string;
  /** Give up if the robot doesn't acknowledge within this time. */
  ackTimeoutMs: number;
  /**
   * Web only: browsers don't report the MTU. Off (default) → 20-byte writes, the BLE minimum.
   * On → MTU−3-byte writes, which the firmware must accept as BLE "long writes".
   */
  webLongWrites: boolean;
};

/** Nordic UART Service: the common "serial over BLE" profile used by ESP32 / nRF firmware. */
export const NORDIC_UART = {
  serviceUUID: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
  rxCharacteristicUUID: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
  txCharacteristicUUID: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
};

export const DEFAULT_ROBOT_SETTINGS: RobotSettings = {
  firmware: 'grbl',
  stopCommand: '',
  mtu: 400,
  ...NORDIC_UART,
  ackMode: 'grbl',
  rxBufferBytes: 128,
  ackToken: 'ok',
  ackTimeoutMs: 30_000,
  webLongWrites: false,
};

/** Payload of the smallest BLE MTU (23), which every device supports. */
export const MIN_PAYLOAD_BYTES = 20;

/** Largest chunk of G-code that fits in one write for a negotiated MTU. */
export function payloadSize(requestedMtu: number, negotiatedMtu: number): number {
  return Math.max(MIN_PAYLOAD_BYTES, Math.min(requestedMtu, negotiatedMtu) - ATT_HEADER_BYTES);
}

/**
 * Bytes per BLE write for a connection: from the *negotiated* MTU when the platform reports
 * it (iOS / Android); otherwise (web) the 20-byte minimum unless long writes are enabled.
 */
export function chunkPayload(
  settings: Pick<RobotSettings, 'mtu' | 'webLongWrites'>,
  link: { mtu: number; mtuKnown: boolean }
): number {
  if (!link.mtuKnown && !settings.webLongWrites) return MIN_PAYLOAD_BYTES;
  return payloadSize(settings.mtu, link.mtu);
}

export type GcodeChunk = {
  bytes: Uint8Array;
  /** Number of G-code lines (newline-terminated) in this chunk. */
  lines: number;
};

/**
 * Splits G-code into chunks of at most `maxBytes`, breaking only between lines. Every line
 * keeps its trailing `\n`. A single line longer than `maxBytes` (never produced by RoboSketch)
 * is split mid-line as a last resort. Non-ASCII characters become `?`.
 */
export function chunkGcode(gcode: string, maxBytes: number): GcodeChunk[] {
  const lines = gcode
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line, i, all) => line.length > 0 || i < all.length - 1)
    .map((line) => `${line}\n`);

  const chunks: GcodeChunk[] = [];
  let parts: string[] = [];
  let size = 0;
  const flush = () => {
    if (!parts.length) return;
    chunks.push({ bytes: asciiBytes(parts.join('')), lines: parts.length });
    parts = [];
    size = 0;
  };

  for (const line of lines) {
    if (line.length > maxBytes) {
      flush();
      for (let i = 0; i < line.length; i += maxBytes) {
        const piece = line.slice(i, i + maxBytes);
        chunks.push({ bytes: asciiBytes(piece), lines: piece.endsWith('\n') ? 1 : 0 });
      }
      continue;
    }
    if (size + line.length > maxBytes) flush();
    parts.push(line);
    size += line.length;
  }
  flush();
  return chunks;
}

function asciiBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    out[i] = code < 128 ? code : 63; // '?'
  }
  return out;
}

export function bytesToText(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
  return text;
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64 encoder that works the same on Hermes, web and Node (BLE libraries take base64). */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += BASE64[a >> 2] + BASE64[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? BASE64[((b & 15) << 2) | (c >> 6)] : '=';
    out += i + 2 < bytes.length ? BASE64[c & 63] : '=';
  }
  return out;
}
