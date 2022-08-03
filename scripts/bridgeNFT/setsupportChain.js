require("dotenv").config();
const config = require("config");
const Web3 = require("web3");
const BridgeABI = require("./nft721.json");
const PrivateKeyProvider = require("truffle-privatekey-provider");

const privateKey = '0x7aa2b65fac2c4ef15460f2c82af1f2b0ff129870733304a12ffc61248d405bc3'

async function requestBridge() {
  // try {
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
        .setSupportedChainIds(config.crawlChainIds['nft721' + config.caspernetwork], true)
        .send({
          chainId: networkId,
          from: mainAccount,
          gas: 1000000,
        }, function (err, hash) {
          if (!err) {
            console.log("set support chainId for chain", networkId, hash);
          } else {
            console.error('error', networkId, err)
          }
        });

    }
    console.log("done");

  // } catch (e) {
  //   console.log(e);
  // }
}

requestBridge();
