const status = require('./index');

const frame = {
    ADSC: { raw: '041964385922', value: 41964385922 },
    SINSTS: { raw: '01392', value: 1392 },
};

beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-30T08:17:30Z'));
    status.reset();
});

afterEach(() => {
    jest.useRealTimers();
});

test('toParisIso uses the Europe/Paris offset, winter and summer', () => {
    expect(status.toParisIso(new Date('2026-10-30T08:17:30Z'))).toBe('2026-10-30T09:17:30+01:00');
    expect(status.toParisIso(new Date('2026-07-14T10:00:00Z'))).toBe('2026-07-14T12:00:00+02:00');
    expect(status.toParisIso(new Date('2026-01-14T10:00:00Z'))).toBe('2026-01-14T11:00:00+01:00');
    expect(status.toParisIso(undefined)).toBeNull();
});

test('an output that was never configured is disabled', () => {
    const { outputs } = status.snapshot();

    expect(outputs.ohana.state).toBe('disabled');
    expect(outputs.mqtt.state).toBe('disabled');
});

test('configureOutput hides user info and query string of the target', () => {
    status.configureOutput('mqtt', { enabled: true, target: 'mqtt://user:secret@core-mosquitto:1883/?token=x' });

    expect(status.snapshot().outputs.mqtt.target).toBe('mqtt://core-mosquitto:1883');
});

test('a successful transmission keeps its time and the transmitted values', () => {
    status.configureOutput('ohana', { enabled: true, target: 'http://infra-01.ohana.lan:8770/v1/teleinformation/frames' });
    status.recordAttempt('ohana');
    status.recordSuccess('ohana', frame);
    jest.setSystemTime(new Date('2026-10-30T08:17:40Z'));

    const { ohana } = status.snapshot().outputs;
    expect(ohana.state).toBe('ok');
    expect(ohana.lastSuccessAt).toBe('2026-10-30T09:17:30+01:00');
    expect(ohana.lastSuccessAgeSeconds).toBe(10);
    expect(ohana.lastFrame).toEqual({ ADSC: '041964385922', SINSTS: '01392' });
    expect(ohana.successes).toBe(1);
});

test('failures are counted and the outage duration is returned on recovery', () => {
    status.configureOutput('ohana', { enabled: true, target: 'http://infra-01.ohana.lan:8770/' });
    status.recordSuccess('ohana', frame);

    jest.setSystemTime(new Date('2026-10-30T08:17:32Z'));
    status.recordFailure('ohana', 'connect ECONNREFUSED');
    status.recordFailure('ohana', 'connect ECONNREFUSED');
    expect(status.snapshot().outputs.ohana).toMatchObject({
        state: 'failing',
        consecutiveFailures: 2,
        failures: 2,
        lastError: 'connect ECONNREFUSED',
    });

    jest.setSystemTime(new Date('2026-10-30T08:17:58Z'));
    expect(status.recordSuccess('ohana', frame)).toBe(26);
    expect(status.snapshot().outputs.ohana).toMatchObject({
        state: 'ok',
        consecutiveFailures: 0,
        lastOutageSeconds: 26,
        lastError: 'connect ECONNREFUSED',
    });
});

test('a success without previous failure reports no outage', () => {
    expect(status.recordSuccess('mqtt', frame)).toBeUndefined();
});

test('pause is reported over the other states', () => {
    status.configureOutput('mqtt', { enabled: true, target: 'mqtt://broker:1883' });
    status.recordFailure('mqtt', 'broker unavailable');
    status.setPaused('mqtt', true);

    expect(status.isPaused('mqtt')).toBe(true);
    expect(status.snapshot().outputs.mqtt.state).toBe('paused');

    status.setPaused('mqtt', false);
    expect(status.snapshot().outputs.mqtt.state).toBe('failing');
});

test('serial frames are summarized', () => {
    status.recordFrame(frame);

    expect(status.snapshot().serial).toMatchObject({
        framesRead: 1,
        lastFrame: { ADSC: '041964385922', SINSTS: '01392' },
        lastFrameAgeSeconds: 0,
    });
});

test('an unknown output is rejected', () => {
    expect(() => status.setPaused('smtp', true)).toThrow('Unknown output');
});
