import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { DEFAULT_ROBOT_SETTINGS, payloadSize } from '../lib/robot/protocol';
import { sendGcode } from '../lib/robot/sender';
import { fakeGrbl } from './helpers/fake-grbl';

const GCODE = readFileSync(join(__dirname, '..', 'catalog', 'robot.gcode'), 'utf8');
const commands = GCODE.split('\n')
  .map((l) => l.replace(/;.*$/, '').trim())
  .filter(Boolean);

const sendWithDefaults = (robot: ReturnType<typeof fakeGrbl>) =>
  sendGcode(robot.transport, GCODE, {
    payloadBytes: payloadSize(DEFAULT_ROBOT_SETTINGS.mtu, 517),
    ackMode: DEFAULT_ROBOT_SETTINGS.ackMode,
    ackToken: DEFAULT_ROBOT_SETTINGS.ackToken,
    ackTimeoutMs: 2000,
    rxBufferBytes: (DEFAULT_ROBOT_SETTINGS as { rxBufferBytes?: number }).rxBufferBytes,
  } as Parameters<typeof sendGcode>[2]);

test('B1: default flow control never overflows a 128-byte GRBL RX buffer', async () => {
  const robot = fakeGrbl({ rxBufferBytes: 128 });
  await sendWithDefaults(robot);
  // Let the controller finish what it has.
  await new Promise((r) => setTimeout(r, 50));
  console.log(
    `  ${GCODE.length} B file, ${commands.length} commands: max unprocessed bytes in robot = ${robot.maxBuffered} (buffer 128), BLE writes = ${robot.raw.length}`
  );
  assert.ok(robot.maxBuffered < 128, `robot held ${robot.maxBuffered} unprocessed bytes`);
  assert.deepEqual(robot.executed, commands, 'robot executed every command in order');
});

test('B1: a GRBL error reply stops the job', async () => {
  const robot = fakeGrbl({ failOn: /G1 Z/ });
  await assert.rejects(sendWithDefaults(robot), /error:22/);
});
