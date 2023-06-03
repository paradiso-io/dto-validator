
const BigNumber = require("bignumber.js");

const CasperHelper = require("./helpers/casper");

const { CLPublicKey, DeployUtil } = require("casper-js-sdk");

const { ERC20Client } = require("casper-erc20-js-client");

BigNumber.config({ EXPONENTIAL_AT: [-100, 100] });



let minterHex =
  "020385f8afc8a61ab948e3602cab3a74157010e5e766622f5a3304dda836148cefba";
let minterPubkey = CLPublicKey.fromHex(minterHex);
let signature =
  "b7acd14930b1a133630d8d996e3c2236c13002b3265fcbaaff02c2ba4f36c16b4ec05c9661cd8d9dcfba45385e7dfeca4c954c706dda60ef25795de94729d16a";
signature = Buffer.from(signature, "hex");
signature = Uint8Array.from(signature);
let deployJson =
  '{"deploy":{"hash":"73d3e0d622359a2be85eb5ec118c75f81e2709bf694bc5c891e5302e0f27ff32","header":{"account":"020385f8afc8a61ab948e3602cab3a74157010e5e766622f5a3304dda836148cefba","timestamp":"2022-02-22T00:38:33.194Z","ttl":"30m","gas_price":1,"body_hash":"d69d141abe6f0459136d732c165c9ab85577e1a489c51efa77ebbe9701c45214","dependencies":[],"chain_name":"casper-test"},"payment":{"ModuleBytes":{"module_bytes":"","args":[["amount",{"bytes":"0400ca9a3b","cl_type":"U512"}]]}},"session":{"StoredContractByHash":{"hash":"6e7e8c8fd98cdeffc74aa0dd2255ee5fbcceee9ccca6ca500616b3af423b2d4f","entry_point":"mint","args":[["recipient",{"bytes":"00f74494891ed4cc733e1c8637e53eca9517a231b08167f5186bf0d18a1c7a58e1","cl_type":"Key"}],["amount",{"bytes":"04ffe0f505","cl_type":"U256"}],["mintid",{"bytes":"050000006d696e7432","cl_type":"String"}],["swap_fee",{"bytes":"00","cl_type":"U256"}]]}},"approvals":[]}}';
let deploy = DeployUtil.deployFromJson(JSON.parse(deployJson)).val;
const test = async () => {
  let casperConfig = CasperHelper.getConfigInfo();
  let tokens = casperConfig.tokens;
  const erc20 = new ERC20Client(
    casperConfig.rpc,
    casperConfig.chainName,
    casperConfig.eventStream
  );
  console.log("minterPubkey", minterPubkey);
  await erc20.putSignatureAndSend({
    publicKey: minterPubkey,
    deploy,
    signature,
    nodeAddress: casperConfig.rpc,
  });
};

test();
