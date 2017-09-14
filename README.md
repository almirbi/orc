# Orc
An orchestration/test script for building ContikiOS programs and receiving serial data from SKY motes using ContikiOS.

# Installation

```bash npm install```

# Example usage

```javascript
let Orchestrator = require('./app/Orchestrator.js');

let config = {
    motes: {
        sending: "/dev/ttyUSB2",
        receiving: "/dev/ttyUSB1",
        jamlab: "/dev/ttyUSB0"
    },
    repetitions: 2,
    channels: [26],
    rdcDrivers: ['nullrdc_driver', 'contikimac_driver'],
    interferenceTypes: [0x701, 1, 2, 3, 4, 5, 6, 7],
    programPaths: {
        jamlab: '/code/jamlab/',
        communication: '/code/communication/'
    }
};

peon = new Orchestrator(config);

peon.run().then((results) => {
    console.log(results);
    process.exit(0);
}).catch((e) => {
    console.log(e);
    process.exit(1);
});
```
