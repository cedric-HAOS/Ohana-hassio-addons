const http = require('http');
const status = require('../status');
const { createHandler, isAllowedAddress } = require('./index');

const frame = { ADSC: { raw: '041964385922', value: 41964385922 } };
const controlHeaders = { 'X-Requested-With': 'ohana-panel' };

let server;
let restartAddon;

function request(method, path, headers = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request(
            {
                host: '127.0.0.1',
                port: server.address().port,
                method,
                path,
                headers,
            },
            (response) => {
                let body = '';
                response.on('data', (chunk) => { body += chunk; });
                response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
            },
        );
        req.on('error', reject);
        req.end();
    });
}

beforeEach(async () => {
    status.reset();
    status.configureOutput('ohana', { enabled: true, target: 'http://infra-01.ohana.lan:8770/' });
    status.configureOutput('mqtt', { enabled: false });
    restartAddon = jest.fn().mockResolvedValue(undefined);
    server = http.createServer(createHandler({ restartAddon }));
    await new Promise((resolve) => { server.listen(0, '127.0.0.1', resolve); });
});

afterEach(async () => {
    await new Promise((resolve) => { server.close(resolve); });
});

test('serves the status as JSON', async () => {
    status.recordSuccess('ohana', frame);

    const response = await request('GET', '/api/status');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const body = JSON.parse(response.body);
    expect(body.outputs.ohana.state).toBe('ok');
    expect(body.outputs.ohana.lastFrame).toEqual({ ADSC: '041964385922' });
});

test('serves the page with the ingress base path', async () => {
    const response = await request('GET', '/', { 'X-Ingress-Path': '/api/hassio_ingress/abc123' });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('<base href="/api/hassio_ingress/abc123/">');
});

test('ignores a malicious ingress path', async () => {
    const response = await request('GET', '/', { 'X-Ingress-Path': '/"><script>alert(1)</script>' });

    expect(response.body).toContain('<base href="/">');
    expect(response.body).not.toContain('alert(1)');
});

test('pauses and resumes an enabled output', async () => {
    const paused = await request('POST', '/api/outputs/ohana/pause', controlHeaders);
    expect(paused.status).toBe(200);
    expect(JSON.parse(paused.body).outputs.ohana.state).toBe('paused');
    expect(status.isPaused('ohana')).toBe(true);

    const resumed = await request('POST', '/api/outputs/ohana/resume', controlHeaders);
    expect(JSON.parse(resumed.body).outputs.ohana.paused).toBe(false);
});

test('refuses to pause a disabled output', async () => {
    const response = await request('POST', '/api/outputs/mqtt/pause', controlHeaders);

    expect(response.status).toBe(409);
    expect(status.isPaused('mqtt')).toBe(false);
});

test('refuses control requests without the control header', async () => {
    const response = await request('POST', '/api/outputs/ohana/pause');

    expect(response.status).toBe(403);
    expect(status.isPaused('ohana')).toBe(false);
});

test('rejects an unknown output and an unknown route', async () => {
    expect((await request('POST', '/api/outputs/smtp/pause', controlHeaders)).status).toBe(404);
    expect((await request('GET', '/nope')).status).toBe(404);
    expect((await request('DELETE', '/api/status')).status).toBe(405);
});

test('restart answers immediately then restarts through the Supervisor', async () => {
    const response = await request('POST', '/api/restart', controlHeaders);

    expect(response.status).toBe(202);
    expect(restartAddon).not.toHaveBeenCalled();
    await new Promise((resolve) => { setTimeout(resolve, 700); });
    expect(restartAddon).toHaveBeenCalledTimes(1);
});

test('only the Supervisor and loopback may connect', () => {
    expect(isAllowedAddress('172.30.32.2')).toBe(true);
    expect(isAllowedAddress('::ffff:172.30.32.2')).toBe(true);
    expect(isAllowedAddress('127.0.0.1')).toBe(true);
    expect(isAllowedAddress('::1')).toBe(true);
    expect(isAllowedAddress('192.168.1.50')).toBe(false);
    expect(isAllowedAddress(undefined)).toBe(false);
});
