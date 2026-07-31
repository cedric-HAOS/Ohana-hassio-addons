const axios = require('axios');
const log = require('../log');
const {
    ohanaEnabled,
    ohanaUrl,
    ohanaToken,
    ohanaSource,
    ohanaTimeoutMs,
} = require('../config');

let lastErrorMessage;
let requestInFlight = false;

/**
 * Send one complete decoded Linky frame directly to Ohana-Agent.
 * HTTP failures never interrupt serial reading or the MQTT output.
 */
async function publishFrame({ frame, teleinfoService }) {
    if (!ohanaEnabled || requestInFlight) {
        return;
    }

    const idLabel = teleinfoService.getIdLabel(frame);
    const meterId = frame[idLabel] ? frame[idLabel].raw : undefined;

    if (!meterId) {
        log.warn('Cannot publish an Ohana frame without meter id');
        return;
    }

    requestInFlight = true;
    try {
        await axios.post(
            ohanaUrl,
            {
                schema_version: 1,
                source: ohanaSource,
                meter_id: meterId,
                frame,
            },
            {
                timeout: ohanaTimeoutMs,
                headers: {
                    Authorization: `Bearer ${ohanaToken}`,
                    'Content-Type': 'application/json',
                },
            },
        );
        if (lastErrorMessage) {
            log.info(`Ohana-Agent ingestion restored [${ohanaUrl}]`);
            lastErrorMessage = undefined;
        }
    } catch (error) {
        const message = error.message || String(error);
        if (message !== lastErrorMessage) {
            log.warn(`Unable to publish frame to Ohana-Agent [${ohanaUrl}] (${message})`);
            lastErrorMessage = message;
        }
    } finally {
        requestInFlight = false;
    }
}

function connect({ teleinfoService }) {
    if (!ohanaEnabled) {
        log.info('Ohana direct output disabled');
        return;
    }
    if (!ohanaUrl || !ohanaToken) {
        log.warn('Ohana direct output disabled: OHANA_URL and OHANA_TOKEN are required');
        return;
    }

    log.info(`Ohana direct output enabled [${ohanaUrl}]`);
    teleinfoService.onFrame((frame) => {
        void publishFrame({ frame, teleinfoService });
    });
}

function resetForTests() {
    lastErrorMessage = undefined;
    requestInFlight = false;
}

module.exports = { connect, publishFrame, resetForTests };
