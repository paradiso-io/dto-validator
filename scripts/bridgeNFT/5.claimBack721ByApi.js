require('dotenv').config()
const config = require('config')
const Web3 = require('web3')
const BridgeABI = require('../../contracts/NFT721Bridge.json')
const PrivateKeyProvider = require('truffle-privatekey-provider')
const axios = require('axios')

const privateKey = '0xe9a698185c72b3cebc14d68213e5ead83efdc784ee93f34a0e2e76ba68b07727'

async function claimBridge() {
  if (process.argv.length <= 5) {
    console.error('Missing params: 1. txHash, 2. fromChainId, 3. toChainId, 4. index')
    process.exit(1)
  }
  let txHash = process.argv[2]
  let fromChainId = process.argv[3]
  let toChainId = process.argv[4]
  let index = process.argv[5]

  let networkIds = Object.keys(config.blockchain)
  if (!networkIds.includes(fromChainId) || !networkIds.includes(toChainId)) {
    console.error('Wrong chainId')
    process.exit(1)
  }
  const bridgeAddress = config.contracts[toChainId].nft721
  let rpc = config.blockchain[toChainId].httpProvider
  if (Array.isArray(rpc)) {
    rpc = rpc[0]
  }

  try {
    const web3 = new Web3(new PrivateKeyProvider(privateKey, rpc))
    const mainAccount = await web3.eth.getCoinbase()
    console.log('rpc', rpc, mainAccount)
    console.log('fetching data...')

    let bridge = await new web3.eth.Contract(BridgeABI, bridgeAddress)
    let body = {
      requestHash: txHash,
      fromChainId: fromChainId,
      toChainId: toChainId,
      index: index
    }
    let {data} = await axios.post('http://localhost:4001/nft721/request-withdraw', body, { timeout: 20 * 1000 })

    console.log('claiming...')
    await bridge.methods
      .claimMultiNFT721Token(data.originToken, mainAccount, data.tokenIds, data.chainIdsIndex,
        txHash,
        data.r, data.s, data.v,
        data.name, data.symbol, data.tokenUris)
      .send({
        chainId: parseInt(toChainId),
        from: mainAccount,
      }, (error, hash) => {
        if (!error) {
          console.log('claim hash', hash)
          process.exit(0)
        }
      })

  } catch (e) {
    console.log(e)
    process.exit(1)
  }
}

claimBridge()
