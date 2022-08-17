require("dotenv").config();
const config = require("config");
const BN = require("bignumber.js");
const Web3 = require("web3");
const ERC721 = require("./erc721.json");
const BridgeABI = require("./nft721.json");
const PrivateKeyProvider = require("truffle-privatekey-provider");
const axios = require('axios')

const privateKey = '0xe9a698185c72b3cebc14d68213e5ead83efdc784ee93f34a0e2e76ba68b07727'
const rpc = 'https://data-seed-prebsc-1-s1.binance.org:8545/';
// const rpc = 'https://rinkeby.infura.io/v3/99d4e19c704546fbbbdfe408d354b9c8';
const bridgeAddress = '0xB4D46B3ffd8079bd2b5d69A826bb3014b4153bB4'
const nftToken = '0xf5de760f2e916647fd766b4ad9e85ff943ce3a2b';


let tokenIds = [1777196]
let fromChainId = 42
let toChainId = 97
let index = 0

let chainIdIndex = [fromChainId, fromChainId, toChainId, index]
let txHash = '0x6d245c366b3f879a7957b799bf25ceacdbba5ee88d7e2beacd61a24349967b74'

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
        data.name, data.symbol, data.tokenUris)
      .send({
        // chainId: 4,
        chainId: 97,
        from: mainAccount,
        // gas: 9000000
      });

    console.log("done");
  } catch (e) {
    console.log(e);
  }
}

claimBridge();
