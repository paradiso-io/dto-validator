const express = require('express')
const router = express.Router()
const Web3 = require('web3')
const { exec } = require('child_process')
const fs = require('fs')
const { check, validationResult, query } = require('express-validator')
require('dotenv').config()
const BigNumber = require('bignumber.js')
const config = require("config");
const axios = require("axios");
const Web3Utils = require("../helpers/web3");

BigNumber.config({ EXPONENTIAL_AT: [-100, 100] })

/**
 * check exist mpc wallet on destination chain
 *
 * @param receiver wallet receive token bridge
 *  * @param chainId destination network
 * @return object signature to claim airdrop
 */
router.get('/check/:receiver/:chainId',[
    check('receiver').exists().withMessage('message is require'),
    check('chainId').exists().withMessage('message is require'),
], async function (req, res, next) {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }

})

/**
 * generate new mpc wallet
 *
 * @param receiver wallet receive token bridge
 * @param chainId destination network
 * @return object signature to claim airdrop
 */
router.post('/generate',[
    check('receiver').exists().withMessage('message is require'),
    check('chainId').exists().withMessage('message is require'),
], async function (req, res, next) {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }

    let receiver = req.body.receiver
    let chainId = req.body.chainId

    console.log('body', req.body)
    if (config.proxy) {
        let r = []
        const requestFromOther = async function (i) {
            try {
                await axios.post(config.signatureServer[i] + '/mpc/generate', {receiver, chainId}, { timeout: 50000, validateStatus: false })
            } catch (e) {
                console.log("failed to generate mpc wallet from ", config.signatureServer[i], e.toString())
            }
        }
        for (let i = 0; i < config.signatureServer.length; i++) {
            r.push(requestFromOther(i))
        }
        await Promise.all(r)
    } else {
        console.log('normal')
        let dir = __dirname + `/files/${chainId}/`
        if (!fs.existsSync(dir)){
            fs.mkdirSync(dir, { recursive: true });
        }
        console.log('create dir')

        exec(`./gg18_keygen_client ${config.managerEndpoint} files/${chainId}/${receiver}.json`, { cwd: 'mpc',timeout: 240000, killSignal: "SIGINT" }, async (error, stdout, stderr) => {
            if (error) {
                console.log(`error: ${error.message}`);
            }
            if (stderr) {
                console.log(`stderr: ${stderr}`);
            }
            console.log(`Done`);
        })
        console.log('gen key')


    }
})

/**
 * generate new mpc wallet
 *
 * @param receiver wallet receive token bridge
 * @param chainId destination network
 * @return object signature to claim airdrop
 */
router.post('/submitTransaction',[
    check('receiver').exists().withMessage('message is require'),
    check('chainId').exists().withMessage('message is require'),
    check('transaction').exists().withMessage('message is require'),
], async function (req, res, next) {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }

})


module.exports = router
