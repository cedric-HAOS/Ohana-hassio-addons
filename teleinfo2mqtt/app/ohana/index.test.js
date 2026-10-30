jest.mock('axios');
jest.mock('../config', () => ({
    ohanaEnabled: true,
    ohanaUrl: 'http://infra-01.ohana.lan:8770/v1/teleinformation/frames',
    ohanaToken: 'secret',
    ohanaSource: 'rpi-linky',
    ohanaTimeoutMs: 3000,
}));

const axios = require('axios');
const log = require('../log');
const status = require('../status');
const { publishFrame, resetForTests } = require('./index');

const frame = {
    ADSC: { raw: '041964385922', value: 41964385922 },
    SINSTS: { raw: '01392', value: 1392 },
    NTARF: { raw: '02', value: 2 },
    EASF02: { raw: '06931422', value: 6931422 },
};

const teleinfoService = {
    getIdLabel: jest.fn(() => 'ADSC'),
};

beforeEach(() => {
    axios.post.mockReset();
    resetForTests();
});

test('publishes one decoded frame directly to Ohana-Agent', async () => {
    axios.post.mockResolvedValue({ status: 202 });

    await publishFrame({ frame, teleinfoService });

    expect(axios.post).toHaveBeenCalledWith(
        'http://infra-01.ohana.lan:8770/v1/teleinformation/frames',
        {
            schema_version: 1,
            source: 'rpi-linky',
            meter_id: '041964385922',
            frame,
        },
        {
            timeout: 3000,
            headers: {
                Authorization: 'Bearer secret',
                'Content-Type': 'application/json',
            },
        },
    );
});

test('does not throw when Ohana-Agent is unavailable', async () => {
    axios.post.mockRejectedValue(new Error('connection refused'));

    await expect(publishFrame({ frame, teleinfoService })).resolves.toBeUndefined();
});

test('drops a concurrent frame instead of building an HTTP backlog', async () => {
    let resolveRequest;
    axios.post.mockImplementation(() => new Promise((resolve) => { resolveRequest = resolve; }));

    const first = publishFrame({ frame, teleinfoService });
    await publishFrame({ frame, teleinfoService });
    expect(axios.post).toHaveBeenCalledTimes(1);
    resolveRequest({ status: 202 });
    await first;
});

test('records each transmission and the outage duration in the panel status', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-30T08:17:30Z'));
    status.configureOutput('ohana', { enabled: true, target: 'http://infra-01.ohana.lan:8770/v1/teleinformation/frames' });
    const info = jest.spyOn(log, 'info').mockImplementation(() => {});
    const warn = jest.spyOn(log, 'warn').mockImplementation(() => {});
    try {
        axios.post.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
        await publishFrame({ frame, teleinfoService });
        expect(status.snapshot().outputs.ohana).toMatchObject({
            state: 'failing',
            lastError: 'connect ECONNREFUSED',
        });

        jest.setSystemTime(new Date('2026-10-30T08:17:56Z'));
        axios.post.mockResolvedValue({ status: 202 });
        await publishFrame({ frame, teleinfoService });

        expect(status.snapshot().outputs.ohana).toMatchObject({
            state: 'ok',
            successes: 1,
            lastOutageSeconds: 26,
            lastFrame: expect.objectContaining({ SINSTS: '01392' }),
        });
        expect(info).toHaveBeenCalledWith(expect.stringContaining('restored after 26 s'));
        expect(warn).toHaveBeenCalledTimes(1);
    } finally {
        info.mockRestore();
        warn.mockRestore();
        jest.useRealTimers();
    }
});

test('does not send while the Ohana output is paused from the panel', async () => {
    status.setPaused('ohana', true);

    await publishFrame({ frame, teleinfoService });

    expect(axios.post).not.toHaveBeenCalled();
});
