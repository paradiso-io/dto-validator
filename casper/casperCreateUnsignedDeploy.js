const { utils } = require("casper-js-client-helper");

const BigNumber = require("bignumber.js");

const configInfo = require("config");
const CasperHelper = require("../helpers/casper");
const tokenHelper = require("../helpers/token");

const logger = require("../helpers/logger");
const db = require("../models");
const { CLPublicKey, CLAccountHash, DeployUtil } = require("casper-js-sdk");

const { ERC20Client } = require("casper-erc20-js-client");

const { sha256 } = require("ethereum-cryptography/sha256");

BigNumber.config({ EXPONENTIAL_AT: [-100, 100] });

function toToken(n, decimals) {
  return new BigNumber(n.toString())
    .dividedBy(new BigNumber(10).pow(new BigNumber(decimals.toString())))
    .toString();
}

function toContractUnit(n, decimals) {
  return new BigNumber(n.toString())
    .multipliedBy(new BigNumber(10).pow(new BigNumber(decimals.toString())))
    .toFixed(0);
}

let minterHex =
  "020385f8afc8a61ab948e3602cab3a74157010e5e766622f5a3304dda836148cefba";
let minterPubkey = CLPublicKey.fromHex(minterHex);

const test = async () => {
  let casperConfig = CasperHelper.getConfigInfo();
  let tokens = casperConfig.tokens;
  let contractHash = tokens[0].contractHash;
  const erc20 = new ERC20Client(
    CasperHelper.getRandomCasperRPCLink(),
    casperConfig.chainName,
    casperConfig.eventStream
  );

  await erc20.setContractHash(contractHash);
  let recipientAccountHashByte = minterPubkey.toAccountHash();
  console.log("recipientAccountHashByte", minterPubkey.toAccountHashStr());

  // const name = await erc20.name();
  // console.log(`... Contract name: ${name}`);

  // const symbol = await erc20.symbol();
  // console.log(`... Contract symbol: ${symbol}`);

  // let decimals = await erc20.decimals();
  // console.log(`... Decimals: ${decimals}`);

  // let totalSupply = await erc20.totalSupply();
  // console.log(`... Total supply: ${toToken(totalSupply, decimals)}`);

  // const balance = await erc20.balanceOf(minterPubkey);
  // console.log(
  //   `Balance of ${minterPubkey.toHex()}: ${toToken(balance, decimals)}`
  // );

  //transfer
  {
    // const deployHash = await erc20.transfer(KEYS, new CLAccountHash(recipientAccountHashByte), totalSupply + '100', '2000000000')
    // getDeploy(NODE_ADDRESS!, deployHash)
  }

  //mint
  {
    let deploy = await erc20.createUnsignedMint(
      minterPubkey,
      new CLAccountHash(recipientAccountHashByte),
      "99999999",
      "mint2",
      "1000000000"
    );
    let deployJson = JSON.stringify(DeployUtil.deployToJson(deploy));
    console.log("deploy json:", deployJson);
    console.log(
      "hash to sign",
      sha256(Buffer.from(deploy.hash)).toString("hex")
    );
    // await getDeploy(NODE_ADDRESS!, deployHash)
    // deployHash = await erc20.mint(KEYS, new CLAccountHash(recipientAccountHashByte), '10000', 'mint2', '2000000000')
    // await getDeploy(NODE_ADDRESS!, deployHash)
  }
};

test();
