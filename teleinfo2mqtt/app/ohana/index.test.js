jest.mock('axios');
jest.mock('../config', () => ({
    ohanaEnabled: true,
    ohanaUrl: 'http://infra-01.ohana.lan:8770/v1/teleinformation/frames',
    ohanaToken: 'secret',
    ohanaSource: 'rpi-linky',
    ohanaTimeoutMs: 3000,
}));

const axios = require('axios');
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
