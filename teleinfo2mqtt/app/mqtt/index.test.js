const HistoryTicMode = require('../teleinfo/history/HistoryTicMode');

jest.mock('async-mqtt', () => ({
    connect: jest.fn(),
}));

const sample = {
    ADCO: { raw: '012345678912', value: 12345678912 },
    OPTARIF: { raw: 'BASE', value: 'BASE' },
    BASE: { raw: '022304568', value: 22304568 },
    PAPP: { raw: '00720', value: 720 },
};

function mqttClient() {
    return {
        connected: true,
        publish: jest.fn().mockResolvedValue(undefined),
        end: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
        _client: { options: {} },
    };
}

beforeEach(() => {
    jest.resetModules();
});

test('connect creates a reconnecting MQTT client', () => {
    const client = mqttClient();
    const mqttAsync = require('async-mqtt');
    mqttAsync.connect.mockReturnValue(client);
    const mqtt = require('./index');

    expect(mqtt.connect({})).toBe(client);
    expect(mqttAsync.connect).toHaveBeenCalledWith(
        'mqtt://localhost:1883',
        expect.objectContaining({ reconnectPeriod: 10000, rejectUnauthorized: true }),
    );
});

test('publishFrame sends the decoded frame when MQTT is connected', async () => {
    const client = mqttClient();
    const mqttAsync = require('async-mqtt');
    mqttAsync.connect.mockReturnValue(client);
    const mqtt = require('./index');
    mqtt.connect({});

    await mqtt.publishFrame({ frame: sample, teleinfoService: new HistoryTicMode() });

    expect(client.publish).toHaveBeenCalledWith(
        'teleinfo/012345678912',
        JSON.stringify(sample),
    );
});

test('publishFrame returns without failure while MQTT is unavailable', async () => {
    const client = mqttClient();
    client.connected = false;
    const mqttAsync = require('async-mqtt');
    mqttAsync.connect.mockReturnValue(client);
    const mqtt = require('./index');
    mqtt.connect({});

    await expect(
        mqtt.publishFrame({ frame: sample, teleinfoService: new HistoryTicMode() }),
    ).resolves.toBeUndefined();
    expect(client.publish).not.toHaveBeenCalled();
});

test('publishFrame records the transmission in the panel status', async () => {
    const client = mqttClient();
    const mqttAsync = require('async-mqtt');
    mqttAsync.connect.mockReturnValue(client);
    const mqtt = require('./index');
    const status = require('../status');
    mqtt.connect({});

    await mqtt.publishFrame({ frame: sample, teleinfoService: new HistoryTicMode() });

    expect(status.snapshot().outputs.mqtt).toMatchObject({
        state: 'ok',
        successes: 1,
        lastFrame: expect.objectContaining({ PAPP: '00720' }),
    });
});

test('publishFrame records an unavailable broker as a failure', async () => {
    const client = mqttClient();
    client.connected = false;
    const mqttAsync = require('async-mqtt');
    mqttAsync.connect.mockReturnValue(client);
    const mqtt = require('./index');
    const status = require('../status');
    mqtt.connect({});

    await mqtt.publishFrame({ frame: sample, teleinfoService: new HistoryTicMode() });

    expect(status.snapshot().outputs.mqtt).toMatchObject({
        state: 'failing',
        lastError: 'MQTT broker unavailable',
    });
});

test('publishFrame sends nothing while the MQTT output is paused', async () => {
    const client = mqttClient();
    const mqttAsync = require('async-mqtt');
    mqttAsync.connect.mockReturnValue(client);
    const mqtt = require('./index');
    const status = require('../status');
    mqtt.connect({});
    status.setPaused('mqtt', true);

    await mqtt.publishFrame({ frame: sample, teleinfoService: new HistoryTicMode() });

    expect(client.publish).not.toHaveBeenCalled();
    expect(status.snapshot().outputs.mqtt.attempts).toBe(0);
});
