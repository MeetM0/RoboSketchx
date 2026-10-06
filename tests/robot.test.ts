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

test('B2: GRBL cancel = feed hold, soft reset, unlock, pen up — buffered moves never run', async () => {
  const { stopRobot } = await import('../lib/robot/stop');
  const robot = fakeGrbl({ lineMs: 15 });
  let cancelled = false;
  const sending = sendGcode(robot.transport, GCODE, {
    payloadBytes: 397,
    ackMode: 'none', // worst case: the robot's buffer is full of queued moves
    ackToken: 'ok',
    ackTimeoutMs: 2000,
    isCancelled: () => cancelled,
  }).catch(() => {});
  await new Promise((r) => setTimeout(r, 60));
  cancelled = true;
  await sending;
  const executedAtCancel = robot.executed.length;
  const steps = await stopRobot(robot.transport, {
    firmware: 'grbl',
    stopCommand: '',
    penUpLine: 'G0 Z5.00',
  });
  await new Promise((r) => setTimeout(r, 200));
  const tail = robot.raw
    .slice(-4)
    .map((b) => (b.length === 1 ? `0x${b[0].toString(16)}` : String.fromCharCode(...b)));
  console.log(
    `  executed at cancel ${executedAtCancel}, after stop ${robot.executed.length} (${robot.executed.slice(executedAtCancel).join(' | ')}); last writes ${JSON.stringify(tail)}; steps ${JSON.stringify(steps)}`
  );
  assert.deepEqual(tail, ['0x21', '0x18', '$X\n', 'G0 Z5.00\n']);
  assert.equal(robot.resets, 1);
  // Only the unlock and pen-up ran after the stop — none of the buffered drawing moves.
  assert.deepEqual(robot.executed.slice(executedAtCancel), ['$X', 'G0 Z5.00']);
});

test('B2: custom firmware cancel = stop command, then pen up', async () => {
  const { stopRobot } = await import('../lib/robot/stop');
  const robot = fakeGrbl();
  await stopRobot(robot.transport, { firmware: 'custom', stopCommand: 'M0', penUpLine: 'M5' });
  assert.deepEqual(
    robot.raw.map((b) => String.fromCharCode(...b)),
    ['M0\n', 'M5\n']
  );
});

test('B4: a dropped connection fails the job and the next connection stops the robot first', async () => {
  const { runJob, recoverOnConnect } = await import('../lib/robot/job');
  const robot = fakeGrbl({ lineMs: 5 });
  let disconnected = false;
  let writes = 0;
  const flaky = {
    ...robot.transport,
    async write(bytes: Uint8Array) {
      if (++writes > 5) {
        disconnected = true;
        throw new Error('Device disconnected');
      }
      await robot.transport.write(bytes);
    },
  };
  const result = await runJob(flaky, GCODE, {
    send: {
      payloadBytes: 397,
      ackMode: 'grbl',
      ackToken: 'ok',
      ackTimeoutMs: 2000,
      rxBufferBytes: 128,
    },
    userCancelled: () => false,
    disconnected: () => disconnected,
  });
  console.log(
    `  result: ${JSON.stringify({ state: result.state, needsStop: result.needsStop, sent: result.progress.chunksSent, error: result.error })}`
  );
  assert.equal(result.state, 'failed');
  assert.equal(result.needsStop, true);
  assert.match(result.error ?? '', /connection lost/i);

  // Reconnect: the stop sequence goes out before anything else; nothing resumes.
  const fresh = fakeGrbl();
  const steps = await recoverOnConnect(fresh.transport, result.needsStop, {
    firmware: 'grbl',
    stopCommand: '',
    penUpLine: 'G0 Z5.00',
  });
  const sent = fresh.raw.map((b) =>
    b.length === 1 ? `0x${b[0].toString(16)}` : String.fromCharCode(...b)
  );
  console.log(`  on reconnect: ${JSON.stringify(sent)}`);
  assert.deepEqual(sent, ['0x21', '0x18', '$X\n', 'G0 Z5.00\n']);
  assert.ok(steps.length > 0);
  assert.deepEqual(
    await recoverOnConnect(fakeGrbl().transport, false, {
      firmware: 'grbl',
      stopCommand: '',
      penUpLine: 'G0 Z5.00',
    }),
    []
  );
});

test('B4: user cancel is still "cancelled", other errors "failed"', async () => {
  const { runJob } = await import('../lib/robot/job');
  const robot = fakeGrbl({ lineMs: 5 });
  let n = 0;
  const cancelled = await runJob(robot.transport, GCODE, {
    send: {
      payloadBytes: 397,
      ackMode: 'grbl',
      ackToken: 'ok',
      ackTimeoutMs: 2000,
      rxBufferBytes: 128,
    },
    userCancelled: () => ++n > 20,
    disconnected: () => false,
  });
  assert.equal(cancelled.state, 'cancelled');
  assert.equal(cancelled.needsStop, true);
  const failed = await runJob(fakeGrbl({ failOn: /G1 Z/ }).transport, GCODE, {
    send: {
      payloadBytes: 397,
      ackMode: 'grbl',
      ackToken: 'ok',
      ackTimeoutMs: 2000,
      rxBufferBytes: 128,
    },
    userCancelled: () => false,
    disconnected: () => false,
  });
  assert.equal(failed.state, 'failed');
  assert.match(failed.error ?? '', /error:22/);
});
