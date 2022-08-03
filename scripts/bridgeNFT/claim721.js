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
const rpc = 'https://xapi.testnet.fantom.network/lachesis';
const bridgeAddress = '0x4B42d0eB78a960Ef96ed3E516Ce564e84E82589d'
const gasPrice = "10000000000";
const log = console.log;
const nftToken = '0x9838c4943c203a8478b21e233e4df3baaeed8770';


let signer1 = '0x2ac7bed81e53cb27dd36a0d8b3ddfecc27b53d735ab70b40268731a7fb0a521b'
let signer1Address = '0xdcaf39430997de9a96a088b31c902b4d10a55177'

let signer2 = '0x69b134d201b8087231a9f5deaa3ad4185ec83e2233430a1ea14e9fe955e671cb'
let signer2Address = '0xa25e5e605479574bd789afbb0970e7a9b2bcca64'

let tokenId = 1
// let chainIdIndex = [4, 4, 97, 0]
let chainIdIndex = [97, 97, 4002, 0]
let txHash = '0xd6c89aef48733198afb564cdf5dec8fa6308372247b04da8ceb167efd4aa4f97'

let name = 'NFTRinkeby'
let symbol = 'NFT4'

function signClaim(signer, _originToken, _to, _tokenId, _chainIdsIndex, _txHash, _name, _symbol) {
  let web3 = new Web3()
  let encoded = web3.eth.abi.encodeParameters(
    ['address', 'address', 'uint256', 'uint256[]', 'bytes32', 'string', 'string'],
    [_originToken, _to, _tokenId, _chainIdsIndex, _txHash, _name, _symbol])
  let msgHash = web3.utils.sha3(encoded);
  let sig = web3.eth.accounts.sign(msgHash, signer);
  return { msgHash: msgHash, r: sig.r, s: sig.s, v: sig.v }
}


async function claimBridge() {
  try {
    const web3 = new Web3(new PrivateKeyProvider(privateKey, rpc));
    const accounts = await web3.eth.getAccounts();
    const mainAccount = accounts[0];
    log("rpc", rpc);
    log("Request from account", mainAccount);

    let bridge = await new web3.eth.Contract(BridgeABI, bridgeAddress);

    let sign1 = signClaim(signer1, nftToken, mainAccount, tokenId, chainIdIndex, txHash, name, symbol)
    let sign2 = signClaim(signer2, nftToken, mainAccount, tokenId, chainIdIndex, txHash, name, symbol)

    //approve
    console.log("request");
    await bridge.methods
      .claimNFT721Token(nftToken, mainAccount, tokenId, chainIdIndex,
        txHash,
        [sign1.r, sign2.r], [sign1.s, sign2.s], [sign1.v, sign2.v],
        name, symbol)
      .send({
        chainId: 4002,
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
