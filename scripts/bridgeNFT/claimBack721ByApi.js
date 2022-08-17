require("dotenv").config();
const config = require("config");
const BN = require("bignumber.js");
const Web3 = require("web3");
const ERC721 = require("./erc721.json");
const BridgeABI = require("./nft721.json");
const PrivateKeyProvider = require("truffle-privatekey-provider");
const axios = require('axios')

const privateKey = '0xe9a698185c72b3cebc14d68213e5ead83efdc784ee93f34a0e2e76ba68b07727'
// const rpc = 'https://data-seed-prebsc-1-s1.binance.org:8545/';
const rpc = 'https://kovan.infura.io/v3/99d4e19c704546fbbbdfe408d354b9c8';
const bridgeAddress = '0x9de8C0Bc516c26e3Eb25c4C8995c5636084fB4C8'
const nftToken = '0xf5de760f2e916647fd766B4AD9E85ff943cE3A2b';


let tokenIds = [1777196, 1777197]
let fromChainId = 4
let toChainId = 42
let index = 0

let chainIdIndex = [42, fromChainId, toChainId, index]
let txHash = '0xaa6c1a5c7d3b1a3d96c875f790cd53d94f0ab37ccc36edb6722ea2811d972e01'

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
    console.log('input', nftToken, mainAccount, tokenIds, chainIdIndex,
      txHash,
      data.r, data.s, data.v,
      data.name, data.symbol)
    // return
    //approve
    console.log("request");
    await bridge.methods
      .claimMultiNFT721Token(nftToken, mainAccount, tokenIds, chainIdIndex,
        txHash,
        data.r, data.s, data.v,
        data.name, data.symbol)
      .send({
        chainId: 42,
        from: mainAccount,
        gas: 9000000
      });

    console.log("done");
  } catch (e) {
    console.log(e);
  }
}

claimBridge();
