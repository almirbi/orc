let orchestrator = require('./app/Orchestrator.js');

let config = {
    motes: {
        sending: "/dev/ttyUSB2", // OWL
        receiving: "/dev/ttyUSB1", // EAGLE
        jamlab: "/dev/ttyUSB0" // TIGER
    },
    repetitions: 1,
    channels: [26],
    rdcDrivers: ['nullrdc_driver', 'contikimac_driver'],
    interferenceTypes: [0x701, 1, 2, 3, 4, 5, 6, 7, 0],
    programPaths: {
        jamlab: '/code/master-thesis/jamlab/',
        communication: '/code/master-thesis/communication/'
    }
};

peon = new orchestrator(config);

peon.run().then((results) => {
    console.log(results);
    process.exit(0);
}).catch((e) => {
    console.log(e);
    process.exit(1);
});
