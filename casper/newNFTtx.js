const db = require('../models')
const crypto = require('crypto')
const generalHelper = require('../helpers/general')
let i = 1
async function main() {
    let name = ['cam1', 'cam2', 'cam3', 'cam4', 'cam5', 'cam6']

    while (true) {

        const meta_data_json1 = {
            "name": generalHelper.randomItemInArray(name),
            "symbol": generalHelper.randomItemInArray(name),
            "token_uri": crypto.randomBytes(20).toString('hex'),
            "checksum": "940bffb3f2bba35f84313aa26da09ece3ad47045c6a1292c2bbd2df4ab1a55fb"
        }
        const meta_data_json2 = {
            "name": generalHelper.randomItemInArray(name),
            "symbol": generalHelper.randomItemInArray(name),
            "token_uri": crypto.randomBytes(20).toString('hex'),
            "checksum": "940bffb3f2bba35f84313aa26da09ece3ad47045c6a1292c2bbd2df4ab1a55fb"
        }

        let newtx = new db.Nft721Transaction({
            requestHash: '0x' + crypto.randomBytes(32).toString('hex'),
            index: i,
            deployHash: '0x' + crypto.randomBytes(32).toString('hex'),
            token_owner: "account-hash-11dfd918953707b354b3ace1c23ca282ff1162e868924f8152711669c0f5534f",
            //fromWallet: '0x' + crypto.randomBytes(20).toString('hex'),
            fromChainId: 1234567,
            originChainId: 123456,
            toChainId: 5678, // casper
            originToken: '0x' + crypto.randomBytes(20).toString('hex'),
            destinationContractHash: crypto.randomBytes(33).toString('hex'),
            timestamp: generalHelper.now(),
            deployJsonString: crypto.randomBytes(20).toString('hex'),
            amount: Math.random() * 1000,
            tokenMetadatas: [JSON.stringify(meta_data_json1), JSON.stringify(meta_data_json2)],
            isNFT: true,
            tokenIds: [crypto.randomBytes(20).toString('hex'), crypto.randomBytes(20).toString('hex')],
            tokenHashes: [generalHelper.randomItemInArray(name), generalHelper.randomItemInArray(name)],

            timestamp: generalHelper.now(),
            isProcessed: false,
            casperDeployCreated: false

        })

        await newtx.save()
        i = i + 1
        console.log("new tx tokenIds: ", newtx.tokenIds)

        console.log('sleep 5 seconds before create an other tx')
        await generalHelper.sleep(5000)
    }

}

main()



