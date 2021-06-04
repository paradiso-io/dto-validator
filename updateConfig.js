const fs = require('fs')
const path = require('path')
const config = require('config')


const contract_dirname = 'dto-contracts'

fs.readdirSync(path.resolve(__dirname, '..', `${contract_dirname}/deployments`))
    .filter(function (file) {
        return (file.indexOf('.') !== 0) && (file !== 'index.js')
    })
    .forEach(function (file) {
        // console.log(file)
        let content = require(path.join(path.resolve(__dirname, '..', contract_dirname,  'deployments', file), 'GenericBridge.json'))
        if (config.contracts[file]) {
            config.contracts[file].bridge = content.address
            config.contracts[file].firstBlockCrawl = content.deployTransaction.blockNumber
            // var model = require(path.join(__dirname, file))
        } else {
            config.contracts[file] = {
                bridge: content.address,
                firstBlockCrawl: content.deployTransaction.blockNumber
            }
        }
    })

// console.log('aaa', data)
console.log(config.contracts)

fs.writeFile("config/default.json", JSON.stringify(config), function(err) {
    if (err) {
        console.log(err);
    }
});
