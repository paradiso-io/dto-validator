
module.exports = {
  apps: [
    {
      name: 'RequestEvent',
      script: 'requestEvent.js',
      exec_mode: 'fork',
      instances: 1,
      restart_delay: 10000,
      autorestart: true,
      watch: true,
      time: true,
    },
    {
      name: 'ValidatorAPI',
      script: 'index.js',
      exec_mode: 'fork',
      instances: 1,
      restart_delay: 10000,
      autorestart: true,
      watch: true,
      time: true,
    },
    {
      name: 'CasperCrawler',
      script: 'casper/caspercrawler.js',
      exec_mode: 'fork',
      instances: 1,
      restart_delay: 10000,
      autorestart: true,
      watch: true,
      time: true,
    },
  ],
}









