require("dotenv").config();
const Web3 = require("web3");
const BridgeABI = require("./nft721.json");
const PrivateKeyProvider = require("truffle-privatekey-provider");


const privateKey = '0xe9a698185c72b3cebc14d68213e5ead83efdc784ee93f34a0e2e76ba68b07727'
// const rpc = 'https://data-seed-prebsc-1-s1.binance.org:8545/';
const rpc = 'https://kovan.infura.io/v3/99d4e19c704546fbbbdfe408d354b9c8';
const bridgeAddress = '0x9de8C0Bc516c26e3Eb25c4C8995c5636084fB4C8'
const log = console.log;
const nftToken = '0xf5de760f2e916647fd766B4AD9E85ff943cE3A2b';

async function requestBridge() {
  try {
    const web3 = new Web3(new PrivateKeyProvider(privateKey, rpc));
    const accounts = await web3.eth.getAccounts();
    const mainAccount = accounts[0];
    log("rpc", rpc);
    log("Request from account", mainAccount);

    let bridge = await new web3.eth.Contract(BridgeABI, bridgeAddress);

    //approve
    console.log("request");
    await bridge.methods
      .requestMultiNFT721Bridge(nftToken, mainAccount, [1777196], 4)
      .send({
        // chainId: 97,
        chainId: 42,
        from: mainAccount,
        // gasPrice: 5000000000,
        // gasLimit: 5000000
      });

    console.log("done");
  } catch (e) {
    console.log(e);
  }
}

requestBridge();
