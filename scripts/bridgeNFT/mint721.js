require("dotenv").config();
const Web3 = require("web3");
const ERC721 = require("./erc721.json");
const PrivateKeyProvider = require("truffle-privatekey-provider");
const erc721Address = "0x9838c4943c203a8478b21e233e4df3baaeed8770"

const privateKey = '0xe9a698185c72b3cebc14d68213e5ead83efdc784ee93f34a0e2e76ba68b07727'
const rpc = 'https://data-seed-prebsc-1-s1.binance.org:8545/';
// const rpc = 'https://rinkeby.infura.io/v3/99d4e19c704546fbbbdfe408d354b9c8';

async function requestBridge() {
  try {
    const web3 = new Web3(new PrivateKeyProvider(privateKey, rpc));
    const accounts = await web3.eth.getAccounts();
    const mainAccount = accounts[0];
    console.log("rpc", rpc);
    console.log("Request from account", mainAccount);

    const token = await new web3.eth.Contract(ERC721, erc721Address);

    //approve
    console.log("mint");
    await token.methods
      .mint(mainAccount, 9)
      .send({
        chainId: 97,
        from: mainAccount,
      });

    console.log("done");
  } catch (e) {
    console.log(e);
  }
}

requestBridge();
