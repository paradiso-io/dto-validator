const Web3 = require('web3')
const BridgeABI = require('../../contracts/NFT721Bridge.json')
const ERC721ABI = require('../../contracts/ERC721.json')
const PrivateKeyProvider = require('truffle-privatekey-provider')
const config = require("config")

// NFT = '0xf5de760f2e916647fd766B4AD9E85ff943cE3A2b'

const privateKey = '0xe9a698185c72b3cebc14d68213e5ead83efdc784ee93f34a0e2e76ba68b07727'

async function requestBridge() {
  if (process.argv.length <= 5) {
    console.error('Missing params: 1. fromNetworkId, 2. toNetworkId, 3. erc721 token, 4. tokenId, 5.recipient')
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
    let recipient = process.argv[6] ? process.argv[6] : mainAccount
    recipient = web3.eth.abi.encodeParameters(["string"], [recipient])
    console.log(mainAccount, 'request transfer token', tokenId, 'nft', erc721, 'from network', networkId, 'to network', toNetworkId)

    let bridge = await new web3.eth.Contract(BridgeABI, bridgeAddress)
    try {
      if (!(await bridge.methods.isERC721(erc721).call())) {
        console.error('token is not erc721')
        process.exit(1)
      }
    } catch (e) {
      console.log(erc721, 'is not a nft token')
      process.exit(1)
    }


    // approve all token
    let nft = await new web3.eth.Contract(ERC721ABI, erc721)
    await nft.methods
      .setApprovalForAll(bridgeAddress, true)
      .send({
        chainId: parseInt(networkId),
        from: mainAccount,
      }, (error, hash) => {
        if (!error) {
          console.log('approve hash', hash)
        }
      })


    console.log('requesting...')
    await bridge.methods
      .requestMultiNFT721Bridge(erc721, recipient, [tokenId], toNetworkId)
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
    process.exit(0)
  }
}

requestBridge();
