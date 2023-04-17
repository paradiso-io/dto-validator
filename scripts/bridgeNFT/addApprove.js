const config = require("config");
const Web3 = require("web3");
const BridgeABI = require("./nft721.json");
const PrivateKeyProvider = require("truffle-privatekey-provider")

let signer1 = '0x2ac7bed81e53cb27dd36a0d8b3ddfecc27b53d735ab70b40268731a7fb0a521b'
let signer1Address = '0xdcaf39430997de9a96a088b31c902b4d10a55177'

let signer2 = '0x69b134d201b8087231a9f5deaa3ad4185ec83e2233430a1ea14e9fe955e671cb'
let signer2Address = '0xa25e5e605479574bd789afbb0970e7a9b2bcca64'

const privateKey = '0x7aa2b65fac2c4ef15460f2c82af1f2b0ff129870733304a12ffc61248d405bc3'
async function requestBridge() {
  let networks = config.crawlChainIds['nft721' + config.caspernetwork]
  for (let i = 0; i < networks.length; i++) {
    let networkId = networks[i]
    let rpc = Array.isArray(config.blockchain[networkId].httpProvider) ? config.blockchain[networkId].httpProvider[0] : config.blockchain[networkId].httpProvider

    const web3 = new Web3(new PrivateKeyProvider(privateKey, rpc));
    const accounts = await web3.eth.getAccounts();
    const mainAccount = accounts[0];

    let bridge = await new web3.eth.Contract(BridgeABI, config.contracts[networkId].nft721);

    //approve
    await bridge.methods
      .addApprovers([signer1Address, signer2Address])
      .send({
        chainId: networkId,
        from: mainAccount,
      }, function (err, hash) {
        if (!err) {
          console.log("addApprovers for chain", networkId, hash);
        } else {
          console.error('error', networkId, err)
        }
      });
  }
  console.log("done");

}

requestBridge();
