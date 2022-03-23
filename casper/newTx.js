const db = require('../models')
const crypto = require('crypto')
const generalHelper = require('../helpers/general')
let i = 1
async function main() {
    let tokens = ['USDT', 'USDC', 'BUSD', 'DAI', 'TUSD', 'UST']
    
    while (true) {
        let choose = generalHelper.randomItemInArray(tokens)
        let requestToCasper = new db.RequestToCasper({
            requestHash: '0x' + crypto.randomBytes(32).toString('hex'),
            index: i,
            deployHash: '0x' + crypto.randomBytes(32).toString('hex'),
            toWallet: crypto.randomBytes(33).toString('hex'),
            //fromWallet: '0x' + crypto.randomBytes(20).toString('hex'),
            fromChainId: generalHelper.randomItemInArray([1, 56, 88, 250, 137, 43114]),
            toChainId: 5678, // casper
            originToken: '0x' + crypto.randomBytes(20).toString('hex'),
            destinationContractHash: crypto.randomBytes(33).toString('hex'),
            timestamp: generalHelper.now(),
            deployJsonString : crypto.randomBytes(20).toString('hex'),
            amount : Math.random() * 1000,
            //sourceTokenSymbol: choose,
            //destinationTokenSymbol: `d${choose}`,
            
            //timestamp: generalHelper.now(),
            isProcessed: false,
            mintid : i
        })

        await requestToCasper.save()
        i = i + 1
        console.log(requestToCasper.requestHash)

        console.log('sleep 30 seconds before create an other tx')
        await generalHelper.sleep(30000)
    }

}

main()



