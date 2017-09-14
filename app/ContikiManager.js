(function() {
    let shell = require('shelljs');

    class ContikiManager {
        constructor(options) {
            this.programPaths = options.programPaths;
            this.motes = options.motes;
        }

        getProjectNameFromMakefile(path) {
            let projectName = shell.exec(`grep ^CONTIKI_PROJECT ${path}/Makefile | awk -F'= |,' '{print $2}'`).trim();
            return projectName;
        }

        uploadContikiProgram(programPath, motes) {
            shell.cd(programPath);
            let projectName = this.getProjectNameFromMakefile(programPath);

            motes.forEach((mote) => {
                shell.exec(`make ${projectName}.upload MOTES=${this.motes[mote]}`);
            });
        }

        buildContikiProgram(config) {
            shell.cd(config.path);
            let projectName = this.getProjectNameFromMakefile(config.path);

            if (config.shouldClean) {
                shell.exec(`make clean`);
            }

            let cmd = '';

            cmd += `make ${projectName}`;

            if (config.flags) {
                Object.keys(config.flags).forEach((flag) => {
                    cmd += ` ${flag}=${config.flags[flag]}`
                });
            }
            
            shell.exec(cmd);
        }

        resetMote(mote) {
            shell.cd(this.programPaths.communication);
            shell.exec(`make sky-reset MOTES=${this.motes[mote]}`);
        }

        startCommunication() {
            this.resetMote('receiving');
            this.resetMote('sending');
        }

        setupCommunication(setup) {
            let interferenceType = parseInt(setup.interferenceType),
            channel = parseInt(setup.channel);

            this.validateInput(channel, this.programPaths);

            this.buildContikiProgram({
                path: this.programPaths.communication,
                flags: {
                    TARGET: 'sky',
                    AB_NETSTACK_CONF_RDC: setup.rdcDriver,
                    AB_CC2420_CONF_CHANNEL: setup.channel
                    // AB_WITH_SEND_CCA: 0
                },
                shouldClean: true
            });

            this.uploadContikiProgram(this.programPaths.communication, ['receiving', 'sending']);
        }

        validateInput(channel, programPaths) {
            if (channel < 11 || channel > 26) {
                throw "Wrong channel [11-26]";
            }

            if (!programPaths || !programPaths.communication || shell.cd(programPaths.communication).code != 0) {
                throw `Communication program path wrong (${programPaths ? programPaths.communication : ''})`;
            }

            if (!programPaths || !programPaths.jamlab || shell.cd(programPaths.jamlab).code != 0) {
                throw `jamlab program path wrong (${programPaths ? programPaths.jamlab : ''})`;
            }
        }

        setupJamlab(setup) {
            this.buildContikiProgram({
                path: this.programPaths.jamlab,
                flags: {
                    TARGET: 'sky',
                    JAMLAB_CONF_INTERFERENCE_TYPE: setup.interferenceType
                },
                shouldClean: true
            });

            this.uploadContikiProgram(this.programPaths.jamlab, ['jamlab']);
        }

        mapContikiToWifiChannel(contikiChannel) {
            if (contikiChannel === 26) {
                return 14;
            } else {
                throw "Don't jam on other channel than 14!!!";
            }
        }
    }

    module.exports = ContikiManager;
})();