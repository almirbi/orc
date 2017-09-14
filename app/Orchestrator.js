(function() {
    let shell = require('shelljs'), 
        SerialPort = require('serialport'),
        parsers = SerialPort.parsers,
        nexutil = require('./NexutilManager.js'),
        contiki = require('./ContikiManager.js'),
        log4js = require('log4js'),
        fs = require('fs');

    class Orchestrator {
        constructor(config) {
            this.motes = config.motes; // { sending: '/dev/tty/', receiving: 'dev/tty' }
            this.ports = []; // { sending: new SerialPort('dev/tty') }
            this.channels = config.channels; // [ 22, 26 ]
            this.rdcDrivers = config.rdcDrivers; // [ contikimac_driver, nullrdc_driver ]
            this.interferenceTypes = config.interferenceTypes // [ 1, 2, 3, 4, 5, 6, 7 ]
            this.programPaths = config.programPaths; // { jamlab: '/code/jamlab', communication: '/code/jamlab-rime-test' }
            this.nexutil = undefined;
            this.contiki = undefined;
            this.repetitions = config.repetitions;

            this.configureLogger();
        }

        configureLogger() {
            log4js.configure({
                appenders: { 
                    custom: { type: 'file', filename: 'custom.log' }
                },
                categories: {
                    default: { appenders: ['custom'], level: 'trace' }
                }
            });

            this.customLogger = log4js.getLogger();
        }

        getMoteSerialPort(moteName) {
            return new Promise((resolve, reject) => {
                if (!this.motes[moteName]) {
                    reject("Mote " + moteName + " not configured");
                }
    
                if (this.ports[moteName] && this.ports[moteName].isOpen) {
                    this.ports[moteName].close(() => {
                        this.ports[moteName] = new SerialPort(this.motes[moteName], { baudRate: 115200 });
                        resolve(this.ports[moteName]);
                    });
                } else {
                    this.ports[moteName] = new SerialPort(this.motes[moteName], { baudRate: 115200 });
                    resolve(this.ports[moteName]);
                }
            });
        }

        setupJampi(setup) {
            if (!this.nexutil) {
                this.nexutil = new nexutil();
            }
        }

        setupContiki(setup) {
            if (!this.contiki) {
                this.contiki = new contiki({
                    programPaths: this.programPaths,
                    motes: this.motes
                });
            }
        }

        connectSerial(mote, dataCallback) {
            this.getMoteSerialPort(mote).then((port) => {
                const parserLine = port.pipe(new parsers.Readline());
                parserLine.on('data', dataCallback ? dataCallback : console.log );
    
                port.on('error', (err) => {
                    console.log('Error: ', err.message);
                });
            });
        }

        waitForResult(cb) {

            this.connectSerial('receiving', (data) => {
                try {
                    let result = JSON.parse(data);
                    this.customLogger.debug(`Data received on serial (receiving)`, result);
                    cb(result);
        
                } catch(e) {
                    this.customLogger.debug("Didnt get valid JSON on serial receiving.");
                }
            });

            return new Promise(resolve => {
                let watchDog;

                this.connectSerial('sending', (data) => {
                    try {
                        clearTimeout(watchDog);
                        let result = JSON.parse(data);
                        this.customLogger.debug(`Data received on serial (sending)`, result);
                        cb(result);
                        if (result.result) {
                            setTimeout(() => {
                                resolve(result);
                            }, 5000);
                        }
                    } catch(e) {
                        this.customLogger.debug("Didnt get valid JSON on serial sending.");
                        this.customLogger.debug(data);
                    }

                });

                watchDog = setTimeout(() => {
                    reject("Timed out waiting on serial");
                }, 10 * 1000);
            });
        }

        getResultsKey(setup) {
            return setup.channel + '-' + setup.cca + '-' + setup.rdcDriver + '';
        }

        resultCallback(data, setup) {            
            if (!this.results) {
                this.results = {};
            }

            let key = this.getResultsKey(setup);
            if (!this.results[key]) {
                this.results[key] = {};
            }

            if (!this.results[key][setup.interferenceType]) {
                this.results[key][setup.interferenceType] = [];
            }

            let old = this.results[key][setup.interferenceType][setup.repetition];
            if (!old) {
                this.results[key][setup.interferenceType].push({
                    tx: [],
                    rx: []
                });
                old = this.results[key][setup.interferenceType][setup.repetition];
            }

            if (!data.tx && !data.rx && old) {
                old = Object.assign(old, data);
                return;
            }

            ['tx', 'rx'].forEach((type) => {
                if (data[type]) {
                    old[type].push(data[type]);
                }
            });
        }

        startTest(setup) {
            this.customLogger.debug("Starting test", setup);

            if (setup.repetition === 0) {
                this.setupContiki();
                
                if (setup.interferenceType <= 7) {
                    if (this.nexutil) {
                        this.customLogger.debug("Stopping nexutil jamming.");
                        this.nexutil.stopJamming();
                    }
                    if (setup.rebuild.jamlab) {
                        this.customLogger.debug("Building JamLab", setup);
                        this.contiki.setupJamlab(setup);
                    }
                } else {
                    switch(setup.interferenceType) {
                        case 0x701:
                            if (this.contiki) {
                                this.customLogger.debug("Stop jamlab jamming", setup);
                                this.contiki.setupJamlab({interferenceType: 0});
                            }
                            this.setupJampi(setup);
                            this.customLogger.debug("Starting nexmon jamming", setup);
                            this.nexutil.startJamming(14);
                            break;
                    }
                }

                if (setup.rebuild.communication) {
                    this.customLogger.debug("Building Communication", setup);
                    this.contiki.setupCommunication(setup);
                }
            }
    
            this.contiki.startCommunication();
            this.customLogger.debug("Motes are reset, communication starting");

            return this.waitForResult((data) => { this.resultCallback(data, setup) });
        }

        run() {
            return new Promise(async (resolve, reject) => {
                let rebuildComm = false, i = 0, j = 0, k = 0, l = 0, setup, key;

                try {
                    this.customLogger.debug("Running Orchestrator.");
                    
                    for (i = 0; i < this.rdcDrivers.length; i++) {
                        rebuildComm = true;
    
                        for (j = 0; j < this.channels.length; j++) {
                            rebuildComm = true;
                            for (k = 0; k < this.interferenceTypes.length; k++) {
                                let rdcDriver = this.rdcDrivers[i];
                                let interferenceType = this.interferenceTypes[k];
                                let channel = this.channels[j];
                                
                                for (l = 0; l < this.repetitions; l++) {
                                    setup = {
                                        interferenceType,
                                        channel,
                                        rdcDriver,
                                        cca: 0,
                                        repetition: l,
                                        rebuild: {
                                            communication: rebuildComm,
                                            jamlab: l === 0,
                                            nexmon: false
                                        }
                                    };
    
                                    key = this.getResultsKey(setup);
                                    rebuildComm = false;
    
                                    await this.startTest(setup).then((result) => {
                                        this.parseResults(setup, {i, j, k, l});
                                    }).catch((e) => {
                                        throw e;
                                    });;
                                }
                            }
                            this.generateReport(key);
                        };
                    };
    
                    this.cleanUp();
                } catch(e) {
                    // save progress as json
                    console.log(e);
                    this.saveProgress(setup, {i, j, k, l});
                    reject(e);
                }
                this.customLogger.debug("Done");
                this.saveProgress(setup, {i, j, k, l});
                resolve(this.results);
            });
        }

        cleanUp() {
            // shell.exec(`mv results.log results-${Math.floor(Date.now() / 1000)}.log`);
            // shell.exec(`mv custom.log custom-${Math.floor(Date.now() / 1000)}.log`);

            // shell.touch(`custom.log`);
            // shell.touch(`results.log`);

            this.ports.forEach((port) => {
                if (port.isOpen) {
                    port.close();
                }
            });
            if (this.nexutil) {
                this.nexutil.stopJamming();
            }
            if (this.contiki) {
                this.contiki.setupJamlab({interferenceType: 0});
            }
        }

        parseResults(setup, position) {
            let key = this.getResultsKey(setup);

            if (!this.results[key] || !this.results[key][setup.interferenceType]) {
                throw "Something went wrong";
            }

            let data = this.results[key][setup.interferenceType][setup.repetition];

            let totalSent = data.result.sent,
                totalFailed = data.result.failed,
                totalReceived = data.rx.length;

            let prr = totalReceived / totalSent,
                arr = (totalSent - totalFailed) / totalSent;

            let total = 0;
            for (let i = 0; i < data.rx.length; i++) {
                total += data.rx[i].rssi;
            }
            let averageRssi = data.rx.length === 0 ? -1 : total / data.rx.length;

            data.result.prr = prr;
            data.result.arr = arr;
            data.result.averageRssi = averageRssi;
            data.result.received = totalReceived;

            this.customLogger.debug(`Result-${position.i}-${position.j}-${position.k}-${position.l}\n`, data.result);

            fs.writeFileSync(`${this.programPaths.communication}log/data-${position.i}-${position.j}-${position.k}-${position.l}.json`, JSON.stringify(this.results));
        }

        saveProgress(setup, position) {
            let progress = {
                results: this.results,
                setup: setup,
                position: position
            }

            fs.writeFileSync(`${this.programPaths.communication}data.json`, JSON.stringify(progress));
        }

        generateReport() {
            let output = '';

            Object.keys(this.results).forEach((key) => {
                output += `\n`;
                output += `Setup: ${key}`;

                for (let i = 0; i < this.interferenceTypes.length; i++) {

                    output += `\nType: ${this.interferenceTypes[i]}\n`;

                    let runs = this.results[key][this.interferenceTypes[i]];

                    for (let j = 0; j < runs.length; j++) {
                        let result = runs[j].result;

                        output += `Run #${j + 1}: `;
                        output += `PRR: ${this.roundToThree(result.prr)} `;
                        output += `ARR: ${this.roundToThree(result.arr)} `;
                        output += `Average RSSI: ${parseFloat(result.averageRssi.toPrecision(3))} `;
                        output += `Sent: ${result.sent} `;
                        output += `Received: ${result.received} `;
                        output += `SentAckd: ${result.sent - result.failed}`;
                    }
                }
            });
        }

        roundToThree(number) {
            return parseFloat((100 * number).toPrecision(3));;
        }
    }

    module.exports = Orchestrator;
})();
