(function() {
    let shell = require('shelljs'),
        log4js = require('log4js'),
        csv = require('csv'),
        parse = require('csv-parse'),
        fs = require('fs'),
        readline = require('readline'),
        async = require('async');

    const OFFSET = 1E03;
    const CLEAR_TO_DECLARE_DEAD_THRESHOLD = 1E-05;
    const PRECISION = 1E2;

    class WaveformParser {

        constructor(config) {
            this.measurments = config // [ {period: 1, megaSamples: 100}, {period: 100, megaSamples: 10} ]

            this.configureLogger();

            this.thresholdYRaw = {
                up: "4E-03",
                down: "-4E-03"
            };
            this.thresholdY = {
                up: parseFloat(this.thresholdYRaw.up) * OFFSET,
                down: parseFloat(this.thresholdYRaw.down) * OFFSET
            };

            this.measurments.forEach((measurement) => {
                let period = measurement.period < 10 ? '0' + measurement.period : measurement.period,
                    inputFile = `/code/master-thesis/orchestration/data/oscilloscope/p${period}-Ms${measurement.megaSamples}.csv`;

                    const rl = readline.createInterface({
                        input: fs.createReadStream(inputFile)
                      });
                      
                    rl.on('line', (line) => {
                        let lineParsed = line.split(",");
                        let x = lineParsed[0].trim();
                        let y = lineParsed[1].trim();

                        this.calculate(x, y);
                    });

                    rl.on('close', () => {
                        this.parseResults(measurement);
                    });
            }, this);
            
        }

        

        calculate(xRaw, yRaw) {
            let x = parseFloat((parseFloat(xRaw) * OFFSET * PRECISION + '').split('.')[0]) * 1E-02,
                y = parseFloat((parseFloat(yRaw) * OFFSET * PRECISION + '').split('.')[0]) * 1E-02;
            this.samiplify(x, y);
        }

        samiplify(x, y) {
            
            let xDiscret = x;
            if (!this.xDiscretMap) {
                this.xDiscretMap = [];
            }
            let xDiscretKey = this.xDiscretMap.length === 0 ? 0 : this.xDiscretMap.length - 1;
            if (!this.xDiscretMap[xDiscretKey]) {
                this.xDiscretMap.push({
                    x: xDiscret,
                    maxY: 0,
                    minY: 0,
                    packetGoingOn: false
                });
            } else if (this.xDiscretMap[xDiscretKey].x != xDiscret) {
                this.xDiscretMap.push({
                    x: xDiscret,
                    maxY: 0,
                    minY: 0,
                    packetGoingOn: false
                });
                xDiscretKey++;
            }

            if (y < this.xDiscretMap[xDiscretKey].minY) {
                this.xDiscretMap[xDiscretKey].minY = y;
                if (y < this.thresholdY.down) {
                    this.xDiscretMap[xDiscretKey].packetGoingOn = true;
                }
            } else if (y > this.xDiscretMap[xDiscretKey].maxY) {
                this.xDiscretMap[xDiscretKey].maxY = y;
                if (y > this.thresholdY.up) {
                    this.xDiscretMap[xDiscretKey].packetGoingOn = true;
                }
            }
        }

        parseResults(measurement) {
            let started = false, beginTime, endTime;

            this.xDiscretMap.forEach((xDiscret) => {
                let x = xDiscret;
                xDiscret = parseFloat(xDiscret.x);
            
                if (x.packetGoingOn) {
                    
                    if (!beginTime) {
                        beginTime = xDiscret;
                    }
                    

                    if (endTime) {
                        let packet = this.packets[this.packets.length - 1];
                        packet.silencePeriod = beginTime - endTime;
                        packet.period = packet.length + packet.silencePeriod;
                    }
                } else {
                    
                    if (beginTime) {
                        endTime = xDiscret;
                        
                        if (!this.packets) {
                            this.packets = [];
                        }

                        this.packets.push({
                            length: endTime - beginTime
                        });

                        beginTime = undefined;
                    }
                }


            });

            this.packets.pop();
            let average = this.calculateAverage();
            let variance = this.calculateVariance(average);
            this.customLogger.debug(`Period: ${measurement.period}, average: ${averagePeriod}ms, variance: ${variance}ms`);
        }

        calculateAverage() {
            let total = 0.0;
            this.packets.forEach((packet, index) => {
                total += packet.period;
            });
            let averagePeriod = total / this.packets.length;
            
            return averagePeriod;
        }

        calculateVariance(average) {
            let sum = 0.0;
            this.packets.forEach((packet, index) => {
                sum += Math.pow((packet.period - average), (packet.period - average));;
            });
            let variance = sum / this.packets.length;
            return variance;
        }

        configureLogger() {
            log4js.configure({
                appenders: {
                    out: { type: 'stdout' },
                    custom: { type: 'file', filename: 'custom.log' }
                },
                categories: {
                    default: { appenders: ['custom', 'out'], level: 'trace' }
                }
            });

            this.customLogger = log4js.getLogger();
        }
    }

    module.exports = WaveformParser;
})();