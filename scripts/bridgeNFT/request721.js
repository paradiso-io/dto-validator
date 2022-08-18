require("dotenv").config();
const Web3Utils = require("../../helpers/web3");
const BridgeABI = require("./nft721.json");
const PrivateKeyProvider = require("truffle-privatekey-provider");


const privateKey = '0xe9a698185c72b3cebc14d68213e5ead83efdc784ee93f34a0e2e76ba68b07727'
// const rpc = 'https://data-seed-prebsc-1-s1.binance.org:8545/';
const rpc = 'https://kovan.infura.io/v3/99d4e19c704546fbbbdfe408d354b9c8';
const bridgeAddress = '0x39B38ce58998743D82ccB006A56B5FAA4dd3A588'
const log = console.log;
const nftToken = '0xDe8466Caf6E4C18c0D8385dCA1d1f1c49F36CF65';

async function requestBridge() {
  try {
    const web3 = await Web3Utils.getWeb3ForPrivateKey(43113, privateKey)
    const accounts = await web3.eth.getAccounts();
    const mainAccount = accounts[0];
    //log("rpc", rpc);
    log("Request from account", mainAccount);
    let toAccount = "0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000004d6163636f756e742d686173682d3835343434626637376332376261666630373730343232333132363361616239373633613039336439386331313566346137646535623638623565376139306400000000000000000000000000000000000000"
    let bridge = await new web3.eth.Contract(BridgeABI, bridgeAddress);

    //approve
    console.log("request");
    await bridge.methods
      .requestMultiNFT721Bridge(nftToken, toAccount, [2], 96945816564243)
      .send({
        // chainId: 97,
        chainId: 43113,
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
