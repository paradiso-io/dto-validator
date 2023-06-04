const express = require('express')
const router = express.Router()
const db = require('../models')
const Web3Utils = require('../helpers/web3')
const { check, validationResult, query } = require('express-validator')
require('dotenv').config()
const config = require('config')
const eventHelper = require('../helpers/event')
const IERC20ABI = require('../contracts/ERC20.json')
const axios = require('axios')
const CasperHelper = require('../helpers/casper')
const logger = require('../helpers/logger')
const casperConfig = CasperHelper.getConfigInfo()
const tokenHelper = require("../helpers/token");
const { getPastEventForBatch, getPastEventForBatchForWrapNonEVM } = require('../requestEventHelper')
const GeneralHelper = require('../helpers/general')
const { fetchTransactionFromCasperIfNot } = require('../casper/caspercrawlerHelper')

router.get('/status', [], async function (req, res) {
    return res.json({ status: 'ok' })
})

router.get('/tvl', [], async function (req, res) {
    let tvl = await db.TVL.findOne({})
    return res.json({
        tvl
    })
})

router.get('/tokenmap', [], async function (req, res) {
    let tokenMap = await db.TokenMap.find({})
    return res.json({
        tokenMap
    })
})

router.get('/bridgeSupportConfig', [], async function (req, res) {
    return res.json({
        tokenBridgeEnabled: true,
        nftBridgeEnabled: config.nftBridgeEnabled ? true : false,
        casperIssuedERC20: config.casperIssuedERC20 ? true : false,
        crawlChainIds: config.crawlChainIds,
        contracts: config.contracts,
        bootstrap: config.bootstrap
    })
})

async function fetchTransactionFromEVMIfNot(fromChainId, requestHash, forced = false) {
    // dont re-index if this is a proxy as the proxy node already index all events in requestEvent and requestNFT721
    if (config.proxy) return
    let transaction = await db.Transaction.findOne({ requestHash: requestHash, fromChainId: fromChainId })
    if (!transaction || forced) {
        logger.info("fetching transcation from chain %s", fromChainId)
        const web3 = await Web3Utils.getWeb3(fromChainId)
        let onChainTx = await GeneralHelper.tryCallWithTrial(async () => {
            let onChainTx = await web3.eth.getTransaction(requestHash)
            return onChainTx
        })
        logger.info("done fetching transcation from chain %s", fromChainId)
        if (!onChainTx) {
            throw 'invalid transaction hash'
        }

        const blockNumberToIndex = onChainTx.blockNumber
        await getPastEventForBatch(fromChainId, config.contracts[`${fromChainId}`].bridge, 10, blockNumberToIndex - 1, blockNumberToIndex + 1)
        await getPastEventForBatchForWrapNonEVM(fromChainId, config.contracts[`${fromChainId}`].wrapNonEVMEventHook, 10, blockNumberToIndex - 1, blockNumberToIndex + 1)
        logger.info('done fetching events from evm for erc20 tokens')
    }
}

/**
 * History of an account
 *
 * @param account wallet address
 * @param networkId network id (or chain id) of EVM a network
 * @param limit limit records per page
 * @param page page want to see
 * @returns object history of request/claim bridge
 */
router.get('/transactions/:account/:networkId', [
    check('account').exists().isLength({ min: 42, max: 68 }).withMessage('address is incorrect.'),
    check('networkId').exists().isNumeric({ no_symbols: true }).withMessage('networkId is incorrect'),
    query('limit').isInt({ min: 0, max: 200 }).optional().withMessage('limit should greater than 0 and less than 200'),
    query('page').isNumeric({ no_symbols: true }).optional().withMessage('page must be number')
], async function (req, res, next) {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }
    let account = req.params.account.toLowerCase()
    if (account.length != 42 && account.length != 68 && account.length != 66) {
        return res.status(400).json({ errors: "invalid address" })
    }
    {
        //check hex
        let temp = account.replace("0x", "")
        var re = /[0-9A-Fa-f]{6}/g;

        if (!re.test(temp)) {
            return res.status(400).json({ errors: "address must be hex" })
        }

        if (account.length == 68 || account.length == 66) {
            if (account.substring(0, 2) != "01" && account.substring(0, 2) != "02") {
                return res.status(400).json({ errors: "invalid casper public key" })
            }

            // if (account.substring(2, 4) != "03" && account.substring(2, 4) != "02") {
            //     return res.status(400).json({ errors: "invalid casper public key" })
            // }

            account = CasperHelper.fromCasperPubkeyToAccountHash(account)
        }
    }
    let limit = (req.query.limit) ? parseInt(req.query.limit) : 20
    let page = req.query.page || 1
    let skip = limit * (page - 1)
    let networkId = req.params.networkId

    let query = {
        $and: [
            { $or: [{ txCreator: account }, { account: account }] },
            { $or: [{ fromChainId: networkId }, { toChainId: networkId }] }
        ]
    }
    let total = await db.Transaction.countDocuments(query)
    let transactions = await db.Transaction.find(query).sort({ requestTime: -1 }).limit(limit).skip(skip).lean().exec()
    for (const t of transactions) {
        if (t.originToken == "0x1111111111111111111111111111111111111111") {
            t.originDecimals = 18
        } else {
            let token = await tokenHelper.getToken(t.originToken, t.originChainId)
            t.originDecimals = token.decimals
        }
    }
    return res.json({
        transactions: transactions,
        page: page,
        limit: limit,
        total: total
    })
})


/* *|CURSOR_MARCADOR|* */
router.get('/transaction-status/:requestHash/:fromChainId', [
    check('requestHash').exists().withMessage('message is required'),
    check('fromChainId').exists().isNumeric({ no_symbols: true }).withMessage('fromChainId is incorrect')
], async function (req, res, next) {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }
    logger.info('processing reqquest %s', req.params)
    let requestHash = req.params.requestHash
    let fromChainId = req.params.fromChainId
    let index = req.query.index ? req.query.index : 0

    if (fromChainId == casperConfig.networkId) {
        await fetchTransactionFromCasperIfNot(requestHash)
    }

    if (!req.query.index) {
        {
            //check transaction on-chain
            if (fromChainId != casperConfig.networkId) {
                await fetchTransactionFromEVMIfNot(fromChainId, requestHash)
                transaction = await eventHelper.getRequestEvent(fromChainId, requestHash)
                if (!transaction || !transaction.requestHash) {
                    //cant find transaction on-chain
                    return res.status(400).json({ errors: "transaction not found" })
                }
                index = transaction.index
            } else {
                let transaction = await db.Transaction.findOne({ requestHash: requestHash, fromChainId: fromChainId })
                index = transaction.index
            }
        }
    }

    //read tx from the server itself
    let requestData = `verify-transaction/${requestHash}/${fromChainId}/${index}`
    let myself = `http://localhost:${config.server.port}/${requestData}`
    let verifyRet = await axios.get(myself)
    let myNodeResult = verifyRet.data
    logger.info('myNodeResult %s', myNodeResult)
    const readStatus = async (i) => {
        try {
            logger.info('reading from %s', config.signatureServer[i])
            let ret = await axios.get(config.signatureServer[i] + `/${requestData}`, { timeout: 10 * 1000 })
            ret = ret.data
            logger.info('reading from ret %s', ret)
            ret = ret.success ? ret.success : false
            return { index: i, success: ret }
        } catch (e) {
            logger.error(e.toString())
        }
        return { index: i, success: false }
    }

    let responses = []
    if (config.signatureServer.length > 0) {
        try {
            let r = []
            for (let i = 0; i < config.signatureServer.length; i++) {
                r.push(readStatus(i))
            }

            responses = await Promise.all(r)

        } catch (e) {
            logger.error(e.toString())
        }
    }

    return res.json({ apiServer: myNodeResult.success, others: responses, index: index })
})

/**
 * History of all bridge in all network
 *
 * @param limit limit records per page
 * @param page page want to see
 * @returns object history of request/claim bridge
 */
router.get('/history', [
    query('limit').isInt({ min: 0, max: 200 }).optional().withMessage('limit should greater than 0 and less than 200'),
    query('page').isNumeric({ no_symbols: true }).optional().withMessage('page must be number')
], async function (req, res, next) {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }
    let limit = (req.query.limit) ? parseInt(req.query.limit) : 50
    let page = req.query.page || 1
    let skip = limit * (page - 1)
    let total = await db.Transaction.countDocuments({})
    let transactions = await db.Transaction.find({}).sort({ requestTime: -1 }).limit(limit).skip(skip).lean().exec()
    for (const t of transactions) {
        if (t.originToken === "0x1111111111111111111111111111111111111111") {
            t.originDecimals = 18
        } else if (t.originChainId != casperConfig.networkId) {
            let token = await tokenHelper.getToken(t.originToken, t.originChainId)
            t.originDecimals = token.decimals
        } else {
            const pairedTokensToEthereum = casperConfig.pairedTokensToEthereum
            const pair = pairedTokensToEthereum.pairs.find(e => e.contractPackageHash == t.originToken)
            if (pair) {
                t.originDecimals = pair.decimals
            } 
        }
    }
    return res.json({
        transactions: transactions,
        page: page,
        limit: limit,
        total: total
    })
})

/**
 * verify a request bridge transaction
 *
 * @param requestHash request bridge transaction hash
 * @param fromChainId network id (or chain id) of EVM a network
 * @param index index of transaction
 * @returns status of transaction: success or not
 */
router.get('/verify-transaction/:requestHash/:fromChainId/:index/:amount', [
    check('requestHash').exists().withMessage('message is require'),
    check('fromChainId').exists().isNumeric({ no_symbols: true }).withMessage('fromChainId is incorrect'),
    check('index').exists().withMessage('index is require')
], async function (req, res, next) {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }

    let requestHash = req.params.requestHash
    let fromChainId = req.params.fromChainId
    let index = req.params.index
    let amount = req.params.amount
    let transaction = {}

    if (fromChainId == casperConfig.networkId) {
        await fetchTransactionFromCasperIfNot(requestHash)
    }

    if (fromChainId !== casperConfig.networkId) {
        await fetchTransactionFromEVMIfNot(fromChainId, requestHash)
        transaction = await eventHelper.getRequestEvent(fromChainId, requestHash)
        if (!transaction.requestHash) {
            await fetchTransactionFromEVMIfNot(fromChainId, requestHash, true)
            transaction = await db.Transaction.findOne({ requestHash: requestHash, fromChainId: fromChainId })
        }
    }
    if (!transaction || (fromChainId !== casperConfig.networkId && !transaction.requestHash)) {
        return res.json({ success: false })
    }
    if (fromChainId !== casperConfig.networkId) {
        let web3 = await Web3Utils.getWeb3(fromChainId)

        if (!transaction) {
            return res.json({ success: false })
        }
        const indbTransaction = await db.Transaction.findOne({ requestHash: requestHash, fromChainId: fromChainId })

        if (indbTransaction.claimed === true) {
            return res.json({ success: true, claimed: true })
        }

        if (transaction.amount != amount) {
            return res.json({ success: false })
        }

        //re-verify whether tx still in the chain and confirmed (enough confirmation)
        let onChainTx = await web3.eth.getTransaction(transaction.requestHash)
        if (!onChainTx) {
            return res.json({ success: false })
        }

        let latestBlockNumber = await web3.eth.getBlockNumber()
        let confirmations = config.blockchain[fromChainId].confirmations
        if (latestBlockNumber - transaction.requestBlock < confirmations) {
            return res.json({ success: false, unconfirmed: true })
        }

        let txBlock = await web3.eth.getBlock(transaction.requestBlock)
        if (!txBlock || txBlock.number !== onChainTx.blockNumber) {
            return res.json({ success: false })
        }

        //is it necessary? check whether tx included in the block
        if (txBlock.transactions.length <= onChainTx.transactionIndex || txBlock.transactions[onChainTx.transactionIndex].toLowerCase() !== transaction.requestHash.toLowerCase()) {
            return res.json({ success: false })
        }
    } else {
        //casper
        try {
            transaction = await db.Transaction.findOne({ requestHash: requestHash, fromChainId: fromChainId })
            if (!transaction) {
                await fetchTransactionFromCasperIfNot(transaction.requestHash, true)
                transaction = await db.Transaction.findOne({ requestHash: requestHash, fromChainId: fromChainId })
                if (!transaction) {
                    return res.json({ success: false })
                }
            }
            if (transaction.index != parseInt(req.params.index)) {
                return res.json({ success: false })
            }

            if (transaction.amount != amount) {
                return res.json({ success: false })
            }
        } catch (e) {
            logger.error(e.toString())
            return res.json({ success: false })
        }
    }
    return res.json({ success: true })
})

router.post('/verify-transaction-full/:requestHash/:fromChainId/:index/:amount', [
    check('requestHash').exists().withMessage('message is require'),
    check('fromChainId').exists().isNumeric({ no_symbols: true }).withMessage('fromChainId is incorrect'),
    check('index').exists().withMessage('index is require')
], async function (req, res, next) {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }

    const verifyingData = req.body.verifyingData
    let requestHash = req.params.requestHash
    let fromChainId = req.params.fromChainId
    let index = req.params.index
    let amount = req.params.amount
    let transaction = {}

    if (fromChainId == casperConfig.networkId) {
        await fetchTransactionFromCasperIfNot(requestHash)
    }

    if (fromChainId !== casperConfig.networkId) {
        await fetchTransactionFromEVMIfNot(fromChainId, requestHash, true)
        transaction = await db.Transaction.findOne({ requestHash: requestHash, fromChainId: fromChainId })
    }
    if (!transaction || (fromChainId !== casperConfig.networkId && !transaction.requestHash)) {
        return res.json({ success: false })
    }

    let dataToVerifyAgainst = {}

    if (fromChainId !== casperConfig.networkId) {
        let web3 = await Web3Utils.getWeb3(fromChainId)

        if (!transaction) {
            return res.json({ success: false })
        }
        if (transaction.claimed === true) {
            return res.json({ success: true, claimed: true })
        }

        if (transaction.index != index) {
            return res.json({ success: false })
        }

        if (transaction.amount != amount) {
            return res.json({ success: false })
        }

        //re-verify whether tx still in the chain and confirmed (enough confirmation)
        let onChainTx = await web3.eth.getTransaction(transaction.requestHash)
        if (!onChainTx) {
            return res.json({ success: false })
        }

        let latestBlockNumber = await web3.eth.getBlockNumber()
        let confirmations = config.blockchain[fromChainId].confirmations
        if (latestBlockNumber - transaction.requestBlock < confirmations) {
            return res.json({ success: false, unconfirmed: true })
        }

        let txBlock = await web3.eth.getBlock(transaction.requestBlock)
        if (!txBlock || txBlock.number !== onChainTx.blockNumber) {
            return res.json({ success: false })
        }

        //is it necessary? check whether tx included in the block
        if (txBlock.transactions.length <= onChainTx.transactionIndex || txBlock.transactions[onChainTx.transactionIndex].toLowerCase() !== transaction.requestHash.toLowerCase()) {
            return res.json({ success: false })
        }

        dataToVerifyAgainst = transaction
    } else {
        //casper
        try {
            transaction = await db.Transaction.findOne({ requestHash: requestHash, fromChainId: fromChainId })
            if (!transaction) {
                return res.json({ success: false })
            }
            let casperRPC = await CasperHelper.getCasperRPC(transaction.requestBlock)
            let deployResult = await casperRPC.getDeployInfo(CasperHelper.toCasperDeployHash(transaction.requestHash))
            let eventData = await CasperHelper.parseRequestFromCasper(deployResult)
            if (eventData.toAddr.toLowerCase() !== transaction.account.toLowerCase()
                || eventData.originToken.toLowerCase() !== transaction.originToken.toLowerCase()
                || eventData.amount !== transaction.amount
                || eventData.fromChainId !== transaction.fromChainId
                || eventData.toChainId !== transaction.toChainId
                || eventData.originChainId !== transaction.originChainId
                || eventData.index !== transaction.index) {
                return res.json({ success: false })
            }
            dataToVerifyAgainst = transaction
        } catch (e) {
            logger.error(e.toString())
            return res.json({ success: false })
        }
    }
    logger.info("data to verify %s", dataToVerifyAgainst)
    if (parseInt(dataToVerifyAgainst.toChainId) == parseInt(casperConfig.networkId)) {
        if (
            parseInt(dataToVerifyAgainst.index) != parseInt(verifyingData.index) ||
            dataToVerifyAgainst.account != verifyingData.toWallet ||
            parseInt(dataToVerifyAgainst.fromChainId) != parseInt(verifyingData.fromChainId) ||
            parseInt(dataToVerifyAgainst.originChainId) != parseInt(verifyingData.originChainId) ||
            dataToVerifyAgainst.originToken != verifyingData.originToken ||
            parseInt(dataToVerifyAgainst.toChainId) != parseInt(verifyingData.toChainId) ||
            dataToVerifyAgainst.amount != verifyingData.amount
        ) {
            return res.json({ success: false, reason: "invalid verifyingData" })
        }

        if (parseInt(dataToVerifyAgainst.originChainId) == parseInt(casperConfig.networkId)) {
            return res.json({ success: false, reason: "unsupported tokens issued on casper" })
        } else {
            const tokenData = CasperHelper.getCasperTokenInfoFromOriginToken(dataToVerifyAgainst.originToken, dataToVerifyAgainst.originChainId)
            if (!tokenData) {
                return res.json({ success: false, reason: "invalid origin token" })
            }

            if (tokenData.contractHash != verifyingData.destinationContractHash) {
                return res.json({ success: false, reason: "invalid destinationContractHash" })
            }
        }
    }

    return res.json({ success: true })
})

/**
 * Request to withdraw bridge request in destination chain
 *
 * @param requestHash request bridge transaction hash
 * @param fromChainId request from network
 * @param toChainId destination network
 * @param index index of transaction
 * @returns signature to claim token
 */
router.post('/request-withdraw', [
    //check('signature').exists().withMessage('signature is require'),
    check('requestHash').exists().withMessage('requestHash is require'),
    check('fromChainId').exists().isNumeric({ no_symbols: true }).withMessage('fromChainId is incorrect'),
    check('toChainId').exists().isNumeric({ no_symbols: true }).withMessage('toChainId is incorrect'),
    check('index').exists().withMessage('index is require')
], async function (req, res, next) {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }
    let requestHash = req.body.requestHash
    let fromChainId = req.body.fromChainId
    let toChainId = req.body.toChainId
    let index = req.body.index
    let transaction = {}
    if (fromChainId == casperConfig.networkId) {
        await fetchTransactionFromCasperIfNot(requestHash)
    }
    if (!config.checkTxOnChain || fromChainId == casperConfig.networkId) {
        transaction = await db.Transaction.findOne({ requestHash: requestHash, fromChainId: fromChainId, toChainId: toChainId, index: index })
        if (!transaction && fromChainId != casperConfig.networkId) {
            await fetchTransactionFromEVMIfNot(fromChainId, requestHash)
            transaction = await eventHelper.getRequestEvent(fromChainId, requestHash)
            logger.info('done getRequestEvent %s', transaction)
        }
    } else {
        await fetchTransactionFromEVMIfNot(fromChainId, requestHash)
        transaction = await eventHelper.getRequestEvent(fromChainId, requestHash)
    }

    logger.info('tx', transaction, fromChainId, casperConfig.networkId)
    if (parseInt(fromChainId) !== casperConfig.networkId) {
        let web3 = await Web3Utils.getWeb3(fromChainId)

        if (!transaction) {
            return res.status(400).json({ errors: 'Transaction does not exist' })
        }
        const indbTransaction = await db.Transaction.findOne({ requestHash: requestHash, fromChainId: fromChainId })

        if (indbTransaction.claimed === true) {
            return res.status(400).json({ errors: 'Transaction claimed' })
        }

        //re-verify whether tx still in the chain and confirmed (enough confirmation)
        let onChainTx = await web3.eth.getTransaction(transaction.requestHash)
        if (!onChainTx) {
            return res.status(400).json({ errors: 'invalid transaction hash' })
        }
        let latestBlockNumber = await web3.eth.getBlockNumber()
        let confirmations = config.blockchain[fromChainId].confirmations
        if (latestBlockNumber - transaction.requestBlock < confirmations) {
            return res.status(400).json({ errors: 'transaction not fully confirmed' })
        }

        let txBlock = await web3.eth.getBlock(transaction.requestBlock)
        if (!txBlock || txBlock.number !== onChainTx.blockNumber) {
            return res.status(400).json({ errors: 'transaction invalid, fork happened' })
        }

        //is it necessary? check whether tx included in the block
        if (txBlock.transactions.length <= onChainTx.transactionIndex || txBlock.transactions[onChainTx.transactionIndex].toLowerCase() !== transaction.requestHash.toLowerCase()) {
            return res.status(400).json({ errors: 'transaction not found, fork happened' })
        }
    } else {
        //casper
        try {
            transaction = await db.Transaction.findOne({ requestHash: requestHash, fromChainId: fromChainId })
            if (!transaction) {
                await fetchTransactionFromCasperIfNot(requestHash, true)
                transaction = await db.Transaction.findOne({ requestHash: requestHash, fromChainId: fromChainId })
                if (!transaction) {
                    return res.json({ success: false })
                }
            }
        } catch (e) {
            logger.error(e.toString())
            return res.status(400).json({ errors: 'failed to get on-chain casper transction for ' + transaction.requestHash })
        }
    }

    logger.info('0')
    const nativeAddress = config.get('nativeAddress')
    let name, decimals, symbol
    if (transaction.originToken.toLowerCase() === nativeAddress.toLowerCase()) {
        logger.info('0.1')
        name = config.blockchain[transaction.originChainId].nativeName
        symbol = config.blockchain[transaction.originChainId].nativeSymbol
        decimals = 18
    } else {
        logger.info('0.2')
        let token = await db.Token.findOne({ hash: transaction.originToken, networkId: transaction.originChainId })

        if (transaction.originChainId == casperConfig.networkId) {
            // originally from casper, take metadata from config for easier access
            const pair = casperConfig.pairedTokensToEthereum.pairs.find(e => e.contractPackageHash == transaction.originToken)
            if (!pair) {
                if (token.name != name || token.symbol != symbol || token.decimals != decimals) {
                    return res.status(400).json({ errors: 'unsupported token' })
                }
            }

            name = pair.name
            symbol = pair.symbol
            decimals = pair.decimals
        } else {
            {
                let web3Origin = await Web3Utils.getWeb3(transaction.originChainId)
                let originTokenContract = await new web3Origin.eth.Contract(IERC20ABI, transaction.originToken)
                name = await originTokenContract.methods.name().call()
                decimals = await originTokenContract.methods.decimals().call()
                symbol = await originTokenContract.methods.symbol().call()
                await db.Token.updateOne({ hash: transaction.originToken, networkId: transaction.originChainId }, {
                    $set: { name, symbol, decimals }
                }, { upsert: true, new: true })
            } 
            if (token) {
                if (token.name != name || token.symbol != symbol || token.decimals != decimals) {
                    return res.status(400).json({ errors: 'Chain state of token ' + token.hash + ' and local database mismatch, dont sign!' })
                }
            }
        }
    }
    logger.info('1')
    if (transaction.toChainId !== transaction.originChainId && transaction.originChainId !== casperConfig.networkId) {
        let nativeName = config.blockchain[transaction.toChainId].nativeName
        name = "DTO Wrapped " + name + `(${nativeName})`
        symbol = "d" + symbol
    }

    if (transaction.toChainId === casperConfig.networkId) {
        return res.status(400).json({ errors: 'Dont manually claim on casper chain' })
    }

    let r = []
    let s = []
    let v = []
    if (config.proxy) {
        let msgHash = ""

        let otherSignature = []
        if (config.signatureServer.length > 0) {
            try {
                let body = {
                    requestHash: req.body.requestHash,
                    fromChainId: req.body.fromChainId,
                    toChainId: req.body.toChainId,
                    index: req.body.index
                }
                let r = []
                const requestSignatureFromOther = async function (i) {
                    let trial = 2;
                    while (trial > 0) {
                        try {
                            logger.info("requesting signature from %s", config.signatureServer[i])
                            let ret = await axios.post(config.signatureServer[i] + '/request-withdraw', body, { timeout: 20 * 1000 })
                            let recoveredAddress = Web3Utils.recoverSignerFromSignature(ret.data.msgHash, ret.data.r[0], ret.data.s[0], ret.data.v[0])
                            logger.info("signature data ok signatureServer=%s, recoveredAddress=%s, msgHash=%s", config.signatureServer[i], recoveredAddress, ret.data.msgHash)
                            return ret
                        } catch (e) {
                            trial--
                        }
                    }
                    logger.warn("failed to get signature from %s", config.signatureServer[i])
                    return { data: {} }
                }
                for (let i = 0; i < config.signatureServer.length; i++) {
                    r.push(requestSignatureFromOther(i))
                }

                const responses = await Promise.all(r)

                for (let i = 0; i < config.signatureServer.length; i++) {
                    otherSignature.push(responses[i].data)
                }

            } catch (e) {
                logger.error(e)
            }
        }

        //dont sign
        if (otherSignature.length > 0) {
            for (let i = 0; i < otherSignature.length; i++) {
                if (otherSignature[i].r) {
                    msgHash = msgHash == "" ? otherSignature[i].msgHash : msgHash
                    r.push(otherSignature[i].r[0])
                    s.push(otherSignature[i].s[0])
                    v.push(otherSignature[i].v[0])
                }
            }
        }

        logger.info("msgHash = %s ", msgHash)
        //reading required number of signature
        let approver = await Web3Utils.getApprovers(transaction.toChainId)
        let minApprovers = approver.number
        let approverList = approver.list
        logger.info('approverList = %s', approverList)

        let goodR = []
        let goodS = []
        let goodV = []
        for (var i = 0; i < r.length; i++) {
            let recoveredAddress = Web3Utils.recoverSignerFromSignature(msgHash, r[i], s[i], v[i])
            if (approverList.includes(recoveredAddress.toLowerCase())) {
                goodR.push(r[i])
                goodS.push(s[i])
                goodV.push(v[i])
            }
        }
        r = goodR
        s = goodS
        v = goodV
        logger.info('r.length = %s', r.length)
        if (r.length < minApprovers) {
            logger.warn('Validators data are not fully synced yet, please try again later')
            return res.status(400).json({ errors: 'Validators data are not fully synced yet, please try again later' })
        }

        r = r.slice(0, minApprovers + 2)
        s = s.slice(0, minApprovers + 2)
        v = v.slice(0, minApprovers + 2)

        const sorted = Web3Utils.sortSignaturesBySigner(msgHash, r, s, v)
        r = sorted.r
        s = sorted.s
        v = sorted.v

        return res.json({ r: r, s: s, v: v, msgHash: msgHash, name: name, symbol: symbol, decimals: decimals })
    } else {
        let txHashToSign = transaction.requestHash.includes("0x") ? transaction.requestHash : ("0x" + transaction.requestHash)
        logger.info("txHashToSign %s", txHashToSign)
        logger.warn("signing data %s , %s , %s, %s , %s , %s,%s , %s , %s,%s , %s  ", transaction.originToken,
            transaction.account,
            transaction.amount,
            transaction.originChainId, transaction.fromChainId, transaction.toChainId, transaction.index,
            txHashToSign,
            name,
            symbol,
            decimals)
        let sig = null
        if (transaction.originChainId == casperConfig.networkId) {
            sig = Web3Utils.signClaimForNonEVMERC20(
                transaction.originToken,
                transaction.account,
                transaction.amount,
                [transaction.originChainId, transaction.fromChainId, transaction.toChainId, transaction.index],
                txHashToSign
            )
        } else {
            sig = Web3Utils.signClaim(
                transaction.originToken,
                transaction.account,
                transaction.amount,
                [transaction.originChainId, transaction.fromChainId, transaction.toChainId, transaction.index],
                txHashToSign,
                name,
                symbol,
                decimals
            )
        }

        let r = [sig.r]
        let s = [sig.s]
        let v = [sig.v]


        return res.json({ r: r, s: s, v: v, msgHash: sig.msgHash, name: name, symbol: symbol, decimals: decimals })
    }
})



router.get('/bridge-fee/:originToken/:networkId/:toChainId', [
    check('networkId').exists().isNumeric({ no_symbols: true }).withMessage('networkId is incorrect'),
    check('toChainId').exists().isNumeric({ no_symbols: true }).withMessage('toChainId is incorrect'),
    check('originToken').exists().isLength({ min: 42, max: 68 }).withMessage('token address is incorrect.')
], async function (req, res, next) {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }
    let originToken = req.params.originToken.toLowerCase()
    if (originToken.length != 42) {
        return res.status(400).json({ errors: "invalid token address" })
    }

    let networkId = req.params.networkId
    let toChainId = req.params.toChainId
    if (`${toChainId}` == `${casperConfig.networkId}`) {
        return CasperHelper.getBridgeFee(originToken)
    }

    let feeToken = await db.Fee.findOne({ token: originToken, networkId: networkId, toChainId: toChainId })
    let feeAmount = '0'
    let feePercent = 0
    let feeDivisor = 10000
    if (feeToken) {
        feeAmount = feeToken.feeAmount
        feePercent = feeToken.feePercent
    }
    return res.json({
        feeAmount: feeAmount,
        feePercent: feePercent,
        feeDivisor: feeDivisor
    })
})


module.exports = router
