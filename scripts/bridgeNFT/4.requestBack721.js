const Web3 = require('web3')
const BridgeABI = require('../../contracts/NFT721Bridge.json')
const ERC721ABI = require('../../contracts/ERC721.json')
const PrivateKeyProvider = require('truffle-privatekey-provider')
const config = require('config')

const privateKey = '0xe9a698185c72b3cebc14d68213e5ead83efdc784ee93f34a0e2e76ba68b07727'

// origin NFT = '0xf5de760f2e916647fd766B4AD9E85ff943cE3A2b'
// new nft = '0xE6F6FA9C06B92edBFfAf5Dc42C8130362177fb95'

async function requestBridge() {
  if (process.argv.length <= 5) {
    console.error('Missing params: 1. fromNetworkId, 2. toNetworkId, 3. erc721 token, 4. tokenId')
    process.exit(1)
  }
  let networkId = process.argv[2]
  let toNetworkId = process.argv[3]
  let erc721 = process.argv[4]
  let tokenId = process.argv[5]

  let networkIds = Object.keys(config.blockchain)
  if (!networkIds.includes(networkId) || !networkIds.includes(toNetworkId)) {
    console.error('Wrong networkId')
    process.exit(1)
  }
  const bridgeAddress = config.contracts[networkId].nft721
  let rpc = config.blockchain[networkId].httpProvider
  if (Array.isArray(rpc)) {
    rpc = rpc[0]
  }
  try {
    const web3 = new Web3(new PrivateKeyProvider(privateKey, rpc))
    const mainAccount = await web3.eth.getCoinbase()

    /*
    // approve for new token
    const newToken = '0x8adbCda18c421577BDc37BfFD234417F3B6fE288'
    const token = await new web3.eth.Contract(ERC721ABI, newToken)
    console.log('approve')
    await token.methods
      .setApprovalForAll(bridgeAddress, true)
      .send({
        chainId: parseInt(networkId),
        from: mainAccount,
      })
    */

    let bridge = await new web3.eth.Contract(BridgeABI, bridgeAddress)

    //approve
    console.log('requesting...')
    await bridge.methods
      .requestMultiNFT721Bridge(erc721, mainAccount, [tokenId], toNetworkId)
      .send({
        chainId: parseInt(networkId),
        from: mainAccount,
      }, (error, hash) => {
        if (!error) {
          console.log('request hash', hash)
          process.exit(0)
        }
      })

  } catch (e) {
    console.log(e)
    process.exit(1)
  }
}

requestBridge()
