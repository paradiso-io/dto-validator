require("dotenv").config();
const config = require("config");
const BN = require("bignumber.js");
const Web3 = require("web3");
const ERC721 = require("./erc721.json");
const BridgeABI = require("./nft721.json");
const PrivateKeyProvider = require("truffle-privatekey-provider");
const erc20Address = "0x9838c4943c203a8478b21e233e4df3baaeed8770"
const axios = require('axios')

console.log("to:", erc20Address);
const privateKey = '0xe9a698185c72b3cebc14d68213e5ead83efdc784ee93f34a0e2e76ba68b07727'
// const rpc = 'https://data-seed-prebsc-1-s1.binance.org:8545/';
const rpc = 'https://rinkeby.infura.io/v3/99d4e19c704546fbbbdfe408d354b9c8';
const bridgeAddress = '0x9de8C0Bc516c26e3Eb25c4C8995c5636084fB4C8'
const nftToken = '0xf5de760f2e916647fd766B4AD9E85ff943cE3A2b';


let tokenIds = [1777197]
let fromChainId = 42
let toChainId = 4
let index = 1

let chainIdIndex = [fromChainId, fromChainId, toChainId, index]
let txHash = '0x8adf4ab2dd19f6f19e67a197a3c14c2a81198b4396434ddd4ddeb0fa8f4dbae0'

async function claimBridge() {
  try {
    const web3 = new Web3(new PrivateKeyProvider(privateKey, rpc));
    const mainAccount = await web3.eth.getCoinbase();
    console.log("rpc", rpc);
    console.log("Request from account", mainAccount);

    let bridge = await new web3.eth.Contract(BridgeABI, bridgeAddress);
    let body = {
      requestHash: txHash,
      fromChainId: fromChainId,
      toChainId: toChainId,
      index: index
    }
    let {data} = await axios.post('http://localhost:4001/nft721/request-withdraw', body, { timeout: 20 * 1000 })


    console.log('ddddd', data)
    // return
    //approve
    console.log("request");
    await bridge.methods
      .claimMultiNFT721Token(nftToken, mainAccount, tokenIds, chainIdIndex,
        txHash,
        data.r, data.s, data.v,
        data.name, data.symbol)
      .send({
        chainId: 4,
        // chainId: 97,
        from: mainAccount,
        gas: 9000000
      });

    console.log("done");
  } catch (e) {
    console.log(e);
  }
}

claimBridge();
