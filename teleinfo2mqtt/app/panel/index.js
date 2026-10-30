const fs = require('fs');
const http = require('http');
const path = require('path');
const axios = require('axios');
const log = require('../log');
const status = require('../status');

// The Supervisor reaches an ingress add-on from this address only.
const SUPERVISOR_ADDRESS = '172.30.32.2';
const SUPERVISOR_RESTART_URL = 'http://supervisor/addons/self/restart';
const CONTROL_HEADER = 'x-requested-with';
const CONTROL_HEADER_VALUE = 'ohana-panel';
const INGRESS_PATH_REGEX = /^\/[A-Za-z0-9_\-/]*$/;
const OUTPUT_ACTION_REGEX = /^\/api\/outputs\/(?<name>[a-z]+)\/(?<action>pause|resume)$/;
const RESTART_DELAY_MS = 500;

let pageTemplate;

function loadPage(ingressPath) {
    if (!pageTemplate) {
        pageTemplate = fs.readFileSync(path.join(__dirname, 'page.html'), 'utf8');
    }
    const base = INGRESS_PATH_REGEX.test(ingressPath || '') ? ingressPath : '';
    return pageTemplate.replace('__BASE__', `${base.replace(/\/$/, '')}/`);
}

function isAllowedAddress(address) {
    const normalized = (address || '').replace(/^::ffff:/, '');
    return normalized === SUPERVISOR_ADDRESS
        || normalized === '127.0.0.1'
        || normalized === '::1';
}

function send(response, statusCode, body, contentType = 'application/json; charset=utf-8') {
    response.writeHead(statusCode, {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
    });
    response.end(typeof body === 'string' ? body : JSON.stringify(body));
}

async function restartThroughSupervisor() {
    const token = process.env.SUPERVISOR_TOKEN;
    if (!token) {
        throw new Error('SUPERVISOR_TOKEN is not available');
    }
    await axios.post(SUPERVISOR_RESTART_URL, {}, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000,
    });
}

/**
 * Build the request handler of the Home Assistant panel (ingress).
 * @param {{restartAddon?: Function}} options
 */
function createHandler({ restartAddon = restartThroughSupervisor } = {}) {
    return (request, response) => {
        if (!isAllowedAddress(request.socket.remoteAddress)) {
            send(response, 403, { error: 'Forbidden' });
            return;
        }

        const pathname = (request.url || '/').split('?')[0];

        if (request.method === 'GET') {
            if (pathname === '/' || pathname === '/index.html') {
                send(response, 200, loadPage(request.headers['x-ingress-path']), 'text/html; charset=utf-8');
            } else if (pathname === '/api/status') {
                send(response, 200, status.snapshot());
            } else {
                send(response, 404, { error: 'Not found' });
            }
            return;
        }

        if (request.method !== 'POST') {
            send(response, 405, { error: 'Method not allowed' });
            return;
        }
        // A custom header forces a CORS preflight for any cross-site request.
        if (request.headers[CONTROL_HEADER] !== CONTROL_HEADER_VALUE) {
            send(response, 403, { error: 'Missing control header' });
            return;
        }

        const outputAction = OUTPUT_ACTION_REGEX.exec(pathname);
        if (outputAction) {
            const { name, action } = outputAction.groups;
            if (!status.OUTPUTS.includes(name)) {
                send(response, 404, { error: 'Unknown output' });
                return;
            }
            if (!status.snapshot().outputs[name].enabled) {
                send(response, 409, { error: 'Output disabled in the add-on configuration' });
                return;
            }
            status.setPaused(name, action === 'pause');
            log.info(`Panel: ${name} output ${action === 'pause' ? 'paused' : 'resumed'}`);
            send(response, 200, status.snapshot());
            return;
        }

        if (pathname === '/api/restart') {
            log.info('Panel: add-on restart requested');
            send(response, 202, { restarting: true });
            setTimeout(() => {
                Promise.resolve()
                    .then(() => restartAddon())
                    .catch((error) => log.error(`Panel: add-on restart failed (${error.message})`));
            }, RESTART_DELAY_MS);
            return;
        }

        send(response, 404, { error: 'Not found' });
    };
}

/**
 * Start the panel. A failure never interrupts serial reading or the outputs.
 * @return {http.Server|undefined}
 */
function start({ port, restartAddon } = {}) {
    const server = http.createServer(createHandler({ restartAddon }));
    server.on('error', (error) => log.warn(`Panel unavailable (${error.message})`));
    server.listen(port, () => log.info(`Panel listening on port ${port}`));
    return server;
}

module.exports = { createHandler, isAllowedAddress, start };
