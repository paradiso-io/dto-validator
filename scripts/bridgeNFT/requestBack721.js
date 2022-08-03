require("dotenv").config();
const config = require("config");
const BN = require("bignumber.js");
const Web3 = require("web3");
const ERC721 = require("./erc721.json");
const BridgeABI = require("./nft721.json");
const PrivateKeyProvider = require("truffle-privatekey-provider");
const erc20Address = "0x9838c4943c203a8478b21e233e4df3baaeed8770"

console.log("to:", erc20Address);
const privateKey = '0xe9a698185c72b3cebc14d68213e5ead83efdc784ee93f34a0e2e76ba68b07727'
const rpc = 'https://data-seed-prebsc-1-s1.binance.org:8545/';
// const rpc = 'https://rinkeby.infura.io/v3/99d4e19c704546fbbbdfe408d354b9c8';
const bridgeAddress = '0x4B42d0eB78a960Ef96ed3E516Ce564e84E82589d'
const gasPrice = "22000000000";
const log = console.log;

const newToken = '0x199920fff554d15dc46d40e403ed7f23197a7143'
const nftToken = '0x9838c4943c203a8478b21e233e4df3baaeed8770';

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
      .requestNFT721Bridge(newToken, mainAccount, 1, 4)
      .send({
        chainId: 97,
        // chainId: 4,
        from: mainAccount,
        gas: 1000000,
        gasPrice: gasPrice,
      });

    console.log("done");
  } catch (e) {
    console.log(e);
  }
}

requestBridge();
