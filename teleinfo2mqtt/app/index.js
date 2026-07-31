const config = require('./config');
const teleinfo = require('./teleinfo');
const Tempo = require('./tempo/Tempo');
const mqtt = require('./mqtt');
const ohana = require('./ohana');
const log = require('./log');

function startOutput(name, connect) {
    try {
        connect();
    } catch (error) {
        log.error(`Unable to start ${name} output; serial reading continues`);
        log.error(error);
    }
}

async function run() {
    const configHidden = {
        ...config,
        mqttPassword: '<hidden>',
        ohanaToken: '<hidden>',
    };
    log.info('Starting teleinfo2mqtt with configuration =', configHidden);

    let teleinfoService;
    try {
        teleinfoService = await teleinfo.connect({ ticMode: config.ticMode });
    } catch (error) {
        log.error('Unable to open or decode the Linky serial stream');
        log.error(error);
        process.exit(1);
        return;
    }

    let tempoService;
    if (config.tempoEnabled) {
        tempoService = new Tempo({
            tempoIntervalMinute: config.tempoIntervalMinute,
        });
    }

    // Both outputs subscribe independently to decoded serial frames.
    startOutput('MQTT', () => mqtt.connect({ teleinfoService, tempoService }));
    startOutput('Ohana', () => ohana.connect({ teleinfoService }));
}

run();
