const fs = require('fs');
const mqtt = require('async-mqtt');
const log = require('../log');
const {
    mqttUrl,
    mqttUser,
    mqttPassword,
    mqttBaseTopic,
    mqttTlsClientKey,
    mqttTlsClientCert,
    mqttTlsCaChain,
    mqttTlsRejectUnauthorized,
    hassDiscovery,
} = require('../config');
const {
    publishConfigurationForHassDiscovery,
    publishTempoConfigurationForHassDiscovery,
} = require('./hass');

let discoveryConfigurationPublished = false;
let discoveryTempoConfigurationPublished = false;
let client;
let unavailableLogged = false;

function getFrameTopic(id) {
    return `${mqttBaseTopic}/${id}`;
}

async function disconnect(force = false) {
    if (!client) return;
    log.info(`Disconnecting from MQTT broker [${mqttUrl}]`);
    try {
        await client.end(force);
    } catch (error) {
        log.warn(`Error while disconnecting from MQTT broker (${error.message})`);
    }
}

async function publishHealthCheck() {
    if (!client || !client.connected) return;
    try {
        await client.publish(`${mqttBaseTopic}/status`, 'up');
    } catch (error) {
        log.warn(`Unable to publish frame to ${mqttBaseTopic}/status (${error.message})`);
    }
}

async function publishFrame({ frame, teleinfoService }) {
    const idLabel = teleinfoService.getIdLabel(frame);
    const id = frame[idLabel] ? frame[idLabel].raw : undefined;
    if (!id) {
        log.warn('Cannot publish a frame without unique id property');
        return;
    }
    if (!client || !client.connected) {
        if (!unavailableLogged) {
            log.warn(`MQTT broker unavailable [${mqttUrl}]; frames continue toward Ohana-Agent`);
            unavailableLogged = true;
        }
        return;
    }

    if (hassDiscovery && !discoveryConfigurationPublished) {
        try {
            await publishConfigurationForHassDiscovery({ client, id, teleinfoService });
            discoveryConfigurationPublished = true;
        } catch (error) {
            log.warn(`Unable to publish discovery configuration (${error.message})`);
        }
    }

    const frameTopic = getFrameTopic(id);
    try {
        await client.publish(frameTopic, JSON.stringify(frame));
        await publishHealthCheck();
    } catch (error) {
        log.warn(`Unable to publish frame to ${frameTopic} (${error.message})`);
    }
}

async function publishTempoData({ tempoData }) {
    if (!client || !client.connected) return;
    if (hassDiscovery && !discoveryTempoConfigurationPublished) {
        await publishTempoConfigurationForHassDiscovery({ client, tempoData });
        discoveryTempoConfigurationPublished = true;
    }
    try {
        await client.publish(getFrameTopic('tempo'), JSON.stringify(tempoData), { retain: true });
    } catch (error) {
        log.warn(`Unable to publish tempo data (${error.message})`);
    }
}

function connect({ teleinfoService, tempoService }) {
    const options = { reconnectPeriod: 10000 };
    if (mqttUser) options.username = mqttUser;
    if (mqttPassword) options.password = mqttPassword;
    if (mqttTlsClientKey) options.key = fs.readFileSync(mqttTlsClientKey);
    if (mqttTlsClientCert) options.cert = fs.readFileSync(mqttTlsClientCert);
    if (mqttTlsCaChain) options.ca = [fs.readFileSync(mqttTlsCaChain)];
    if (mqttTlsRejectUnauthorized !== '') options.rejectUnauthorized = mqttTlsRejectUnauthorized;

    log.info(`Connecting to MQTT broker [${mqttUrl}]`);
    client = mqtt.connect(mqttUrl, options);
    client.on('connect', () => {
        unavailableLogged = false;
        log.info(`Connected to MQTT broker [${mqttUrl}]`);
        // eslint-disable-next-line no-underscore-dangle
        client._client.options.properties = {};
    });
    client.on('reconnect', () => log.info('Reconnecting to the MQTT broker...'));
    client.on('error', (error) => log.warn(`MQTT connection error (${error.message})`));

    process.on('SIGTERM', () => disconnect());
    process.on('SIGINT', () => disconnect(true));

    if (teleinfoService) {
        teleinfoService.onFrame((frame) => {
            void publishFrame({ frame, teleinfoService });
        });
    }
    if (tempoService) {
        tempoService.onChange((tempoData) => {
            void publishTempoData({ tempoData });
        });
        tempoService.startSchedule();
    }
    return client;
}

module.exports = { connect, publishFrame, publishHealthCheck };
