/**
 * Runtime state of the add-on, exposed by the Home Assistant panel.
 * Everything lives in memory: it starts empty with each add-on start.
 */
const OUTPUTS = ['mqtt', 'ohana'];
const PARIS_TIME_ZONE = 'Europe/Paris';

const parisFormat = new Intl.DateTimeFormat('en-GB', {
    timeZone: PARIS_TIME_ZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
});

/**
 * Format a timestamp as an ISO string in Europe/Paris, with its UTC offset.
 * @param {number|Date|undefined} time
 * @return {string|null}
 */
function toParisIso(time) {
    if (time === undefined || time === null) {
        return null;
    }
    const date = new Date(time);
    const parts = Object.fromEntries(
        parisFormat.formatToParts(date).map(({ type, value }) => [type, value]),
    );
    const wallClockAsUtc = Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        Number(parts.hour),
        Number(parts.minute),
        Number(parts.second),
    );
    const utcSeconds = Math.floor(date.getTime() / 1000) * 1000;
    const offsetMinutes = Math.round((wallClockAsUtc - utcSeconds) / 60000);
    const sign = offsetMinutes < 0 ? '-' : '+';
    const absolute = Math.abs(offsetMinutes);
    const offset = `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}

function newOutput() {
    return {
        enabled: false,
        target: undefined,
        connected: undefined,
        paused: false,
        attempts: 0,
        successes: 0,
        failures: 0,
        consecutiveFailures: 0,
        lastAttemptAt: undefined,
        lastSuccessAt: undefined,
        lastFailureAt: undefined,
        lastError: undefined,
        failingSince: undefined,
        lastOutageSeconds: undefined,
        lastFrame: undefined,
    };
}

let startedAt = Date.now();
let info = {};
let serial = { framesRead: 0, lastFrameAt: undefined, lastFrame: undefined };
let outputs = {};

function reset() {
    startedAt = Date.now();
    info = {};
    serial = { framesRead: 0, lastFrameAt: undefined, lastFrame: undefined };
    outputs = Object.fromEntries(OUTPUTS.map((name) => [name, newOutput()]));
}
reset();

function output(name) {
    if (!outputs[name]) {
        throw new Error(`Unknown output [${name}]`);
    }
    return outputs[name];
}

/**
 * Keep the labels of a decoded frame: raw value and unit-less coerced value.
 */
function summarizeFrame(frame) {
    return Object.fromEntries(
        Object.entries(frame || {}).map(([label, item]) => [
            label,
            item && item.raw !== undefined ? String(item.raw) : String(item),
        ]),
    );
}

/**
 * Keep scheme, host, port and path of a URL: never user info or query string.
 */
function safeTarget(target) {
    if (!target) {
        return undefined;
    }
    try {
        const url = new URL(target);
        return `${url.protocol}//${url.host}${url.pathname === '/' ? '' : url.pathname}`;
    } catch (error) {
        return undefined;
    }
}

/**
 * Describe the add-on (version, TIC mode, serial port...).
 */
function setInfo(values) {
    info = { ...info, ...values };
}

/**
 * Declare one output and what it talks to (no credentials).
 */
function configureOutput(name, { enabled, target }) {
    const state = output(name);
    state.enabled = Boolean(enabled);
    state.target = safeTarget(target);
}

function setConnected(name, connected) {
    output(name).connected = connected;
}

/**
 * A frame was decoded from the serial stream.
 */
function recordFrame(frame) {
    serial.framesRead += 1;
    serial.lastFrameAt = Date.now();
    serial.lastFrame = summarizeFrame(frame);
}

function recordAttempt(name) {
    const state = output(name);
    state.attempts += 1;
    state.lastAttemptAt = Date.now();
}

/**
 * Record a successful transmission.
 * @return {number|undefined} Outage duration in seconds when the output recovers.
 */
function recordSuccess(name, frame) {
    const state = output(name);
    const now = Date.now();
    let outageSeconds;
    if (state.failingSince !== undefined) {
        outageSeconds = Math.round((now - state.failingSince) / 1000);
        state.lastOutageSeconds = outageSeconds;
    }
    state.successes += 1;
    state.consecutiveFailures = 0;
    state.failingSince = undefined;
    state.lastSuccessAt = now;
    state.lastFrame = summarizeFrame(frame);
    return outageSeconds;
}

function recordFailure(name, message) {
    const state = output(name);
    const now = Date.now();
    state.failures += 1;
    state.consecutiveFailures += 1;
    state.lastFailureAt = now;
    state.lastError = message;
    if (state.failingSince === undefined) {
        state.failingSince = now;
    }
}

function setPaused(name, paused) {
    output(name).paused = Boolean(paused);
}

function isPaused(name) {
    return output(name).paused;
}

function ageSeconds(time, now) {
    return time === undefined ? null : Math.max(0, Math.round((now - time) / 1000));
}

function outputState(state) {
    if (!state.enabled) return 'disabled';
    if (state.paused) return 'paused';
    if (state.consecutiveFailures > 0) return 'failing';
    if (state.lastSuccessAt === undefined) return 'waiting';
    return 'ok';
}

function snapshotOutput(state, now) {
    return {
        state: outputState(state),
        enabled: state.enabled,
        paused: state.paused,
        target: state.target || null,
        connected: state.connected === undefined ? null : state.connected,
        attempts: state.attempts,
        successes: state.successes,
        failures: state.failures,
        consecutiveFailures: state.consecutiveFailures,
        lastAttemptAt: toParisIso(state.lastAttemptAt),
        lastSuccessAt: toParisIso(state.lastSuccessAt),
        lastSuccessAgeSeconds: ageSeconds(state.lastSuccessAt, now),
        lastFailureAt: toParisIso(state.lastFailureAt),
        lastFailureAgeSeconds: ageSeconds(state.lastFailureAt, now),
        lastError: state.lastError || null,
        failingSinceAt: toParisIso(state.failingSince),
        lastOutageSeconds: state.lastOutageSeconds === undefined ? null : state.lastOutageSeconds,
        lastFrame: state.lastFrame || null,
    };
}

/**
 * Full state shown by the panel. Times are Europe/Paris ISO strings.
 */
function snapshot() {
    const now = Date.now();
    return {
        generatedAt: toParisIso(now),
        startedAt: toParisIso(startedAt),
        uptimeSeconds: Math.round((now - startedAt) / 1000),
        info,
        serial: {
            framesRead: serial.framesRead,
            lastFrameAt: toParisIso(serial.lastFrameAt),
            lastFrameAgeSeconds: ageSeconds(serial.lastFrameAt, now),
            lastFrame: serial.lastFrame || null,
        },
        outputs: Object.fromEntries(
            OUTPUTS.map((name) => [name, snapshotOutput(outputs[name], now)]),
        ),
    };
}

module.exports = {
    OUTPUTS,
    configureOutput,
    isPaused,
    recordAttempt,
    recordFailure,
    recordFrame,
    recordSuccess,
    reset,
    setConnected,
    setInfo,
    setPaused,
    snapshot,
    toParisIso,
};
