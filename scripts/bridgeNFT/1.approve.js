require("dotenv").config();
const config = require("config");
const Web3 = require("web3");
const ERC721ABI = require('../../contracts/ERC721.json')
const PrivateKeyProvider = require("truffle-privatekey-provider");

const privateKey = '0xe9a698185c72b3cebc14d68213e5ead83efdc784ee93f34a0e2e76ba68b07727'

async function approve() {
  if (process.argv.length <= 3) {
    console.error('Missing params: 1. NetworkId, 2. erc721 token')
    process.exit(1)
  }
  let networkId = process.argv[2]
  let erc721 = process.argv[3]

  let networkIds = Object.keys(config.blockchain)
  if (!networkIds.includes(networkId)) {
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

    const token = await new web3.eth.Contract(ERC721ABI, erc721)

    console.log('approve')
    await token.methods
      .setApprovalForAll(bridgeAddress, true)
      .send({
        chainId: parseInt(networkId),
        from: mainAccount,
      }, (error, hash) => {
        if (!error) {
          console.log('approve hash', hash)
          process.exit(0)
        }
      })
  } catch (e) {
    console.log(e);
    process.exit(0)
  }
}

approve();
