(function() {
    let shell = require('shelljs');

    class NexutilManager {
        constructor(path) {
            this.path = path ? path : '/code/master-thesis/nexmon/';
            // fix segmentation fault bug
            // this.installNexmon({rebuild: true});
            this.startMonitorMode();
        }

        startMonitorMode() {
            shell.exec('nexutil -m2');
        }

        installNexmon(options) {
            // shell.exec('sudo su');
            throw "Install nexmon not supported";
            shell.cd(this.path);
            shell.exec('source setup_env.sh');
            shell.cd('patches/bcm43438/7_45_41_26/nexmon');
            if (options.rebuild) {
                shell.exec('make');
            }
            shell.exec('make install-firmware');
            shell.exec('make install-firmware');
        }

        startJamming(channel) {
            shell.exec(`nexutil -s0x701 -i -v ${channel}`);
        }

        stopJamming(channel) {
            
            shell.exec(`nexutil -s0x705`);
            shell.exec('nexutil -m0');
        }
    }

    module.exports = NexutilManager;
})();