
const config = require('config')
const prefix = config.caspernetwork == 'mainnet' ? 'Mainnet.' : 'Testnet.'
const postFix = '.DotOracle'
function restartMinutes(m) {
  return m * 1000
}
const Processes = {
  apps: [
    {
      name: `${prefix}API${postFix}`,
      script: 'index.js',
      exec_mode: 'fork',
      instances: 1,
      restart_delay: restartMinutes(7200),
      autorestart: true,
      watch: true,
      time: true,
    }
  ],
}

if (config.proxy) {
  Processes.apps.push(
    {
      name: `${prefix}RequestEvent${postFix}`,
      script: 'requestEvent.js',
      exec_mode: 'fork',
      instances: 1,
      restart_delay: restartMinutes(3600),
      autorestart: true,
      watch: true,
      time: true,
    },
    {
      name: `${prefix}RequestNFT721${postFix}`,
      script: 'requestNFT721.js',
      exec_mode: 'fork',
      instances: 1,
      restart_delay: restartMinutes(3600),
      autorestart: true,
      watch: true,
      time: true,
    },
    {
      name: `${prefix}CasperCrawl${postFix}`,
      script: 'casper/caspercrawler.js',
      exec_mode: 'fork',
      instances: 1,
      restart_delay: restartMinutes(3600),
      autorestart: true,
      watch: true,
      time: true,
    },
    {
      name: `${prefix}Bootstrap${postFix}`,
      script: 'casper/bootstrap.js',
      exec_mode: 'fork',
      instances: 1,
      restart_delay: restartMinutes(180),
      autorestart: true,
      watch: true,
      time: true,
    },
    {
      name: `${prefix}CreateUnsignedDeploy${postFix}`,
      script: 'casper/createUnsignedDeploy.js',
      exec_mode: 'fork',
      instances: 1,
      restart_delay: restartMinutes(180),
      autorestart: true,
      watch: true,
      time: true,
    },
    {
      name: `${prefix}Producer${postFix}`,
      script: 'casper/newProducer.js',
      exec_mode: 'fork',
      instances: 1,
      restart_delay: restartMinutes(420),
      autorestart: true,
      watch: true,
      time: true,
    },
    {
      name: `${prefix}NFTProducer${postFix}`,
      script: 'casper/NftProducer.js',
      exec_mode: 'fork',
      instances: 1,
      restart_delay: restartMinutes(300),
      autorestart: true,
      watch: true,
      time: true,
    },
  )
}

module.exports = Processes









