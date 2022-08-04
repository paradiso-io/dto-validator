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
// const rpc = 'https://data-seed-prebsc-1-s1.binance.org:8545/';
const rpc = 'https://rinkeby.infura.io/v3/99d4e19c704546fbbbdfe408d354b9c8';
const bridgeAddress = '0x9de8C0Bc516c26e3Eb25c4C8995c5636084fB4C8'
const nftToken = '0xf5de760f2e916647fd766B4AD9E85ff943cE3A2b';


let signer1 = '0x2ac7bed81e53cb27dd36a0d8b3ddfecc27b53d735ab70b40268731a7fb0a521b'
let signer1Address = '0xdcaf39430997de9a96a088b31c902b4d10a55177'

let signer2 = '0x69b134d201b8087231a9f5deaa3ad4185ec83e2233430a1ea14e9fe955e671cb'
let signer2Address = '0xa25e5e605479574bd789afbb0970e7a9b2bcca64'

let tokenIds = [1777196]
// let chainIdIndex = [4, 4, 97, 0]
let chainIdIndex = [42, 42, 4, 0]
let txHash = '0x4b63d09b7fbdd163eaa0c03e6f3a7f447b9e2b5793b1209db55fb5b056a411c6'

let name = 'DTO Wrapped MultiFaucet NFT(Ethereum)'
let symbol = 'dMFNFT'

function signClaim(signer, _originToken, _to, _tokenIds, _chainIdsIndex, _txHash, _name, _symbol) {
  let web3 = new Web3()
  let encoded = web3.eth.abi.encodeParameters(
    ['address', 'address', 'uint256[]', 'uint256[]', 'bytes32', 'string', 'string'],
    [_originToken, _to, _tokenIds, _chainIdsIndex, _txHash, _name, _symbol])
  let msgHash = web3.utils.sha3(encoded);
  let sig = web3.eth.accounts.sign(msgHash, signer);
  return { msgHash: msgHash, r: sig.r, s: sig.s, v: sig.v }
}


async function claimBridge() {
  try {
    const web3 = new Web3(new PrivateKeyProvider(privateKey, rpc));
    const accounts = await web3.eth.getAccounts();
    const mainAccount = accounts[0];
    console.log("rpc", rpc);
    console.log("Request from account", mainAccount);

    let bridge = await new web3.eth.Contract(BridgeABI, bridgeAddress);

    let sign1 = signClaim(signer1, nftToken, mainAccount, tokenIds, chainIdIndex, txHash, name, symbol)
    let sign2 = signClaim(signer2, nftToken, mainAccount, tokenIds, chainIdIndex, txHash, name, symbol)

    //approve
    console.log("request");
    await bridge.methods
      .claimNMultiFT721Token(nftToken, mainAccount, tokenIds, chainIdIndex,
        txHash,
        [sign1.r, sign2.r], [sign1.s, sign2.s], [sign1.v, sign2.v],
        name, symbol)
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
