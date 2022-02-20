import {
  CasperClient,
  CLPublicKey,
  CLAccountHash,
  CLByteArray,
  CLKey,
  CLString,
  CLTypeBuilder,
  CLValue,
  CLValueBuilder,
  CLValueParsers,
  CLMap,
  DeployUtil,
  EventName,
  EventStream,
  Keys,
  RuntimeArgs,
} from "casper-js-sdk";
import { Some, None } from "ts-results";
import * as blake from "blakejs";
import { concat } from "@ethersproject/bytes";
import { CasperContractClient, constants, utils, helpers, types } from "casper-js-client-helper";
import { ERC20Events } from "./constants";
const { DEFAULT_TTL } = constants;
// TODO: Refactor in both clients
const {
  fromCLMap,
  toCLMap,
  installContract,
  setClient,
  contractSimpleGetter,
  contractCallFn,
  createRecipientAddress
} = helpers;
// TODO: Refactor in both clients
type RecipientType = types.RecipientType;
type IPendingDeploy = types.IPendingDeploy;
type IClassContractCallParams = types.IClassContractCallParams;

class ERC20Client extends CasperContractClient {
  protected namedKeys?: {
    allowances: string;
    balances: string;
  };


  /**
   * Installs the ERC20 contract.
   *
   * @param keys AsymmetricKey that will be used to install the contract.
   * @param tokenName Name of the ERC20 token.
   * @param tokenSymbol Symbol of the ERC20 token.
   * @param tokenDecimals Specifies how many decimal places token will have.
   * @param tokenTotalSupply Specifies the amount of tokens in existance.
   * @param paymentAmount The payment amount that will be used to install the contract.
   * @param wasmPath Path to the WASM file that will be installed.
   *
   * @returns Installation deploy hash. 
   */
  public async install(
    keys: Keys.AsymmetricKey,
    tokenName: string,
    tokenSymbol: string,
    tokenDecimals: string,
    tokenTotalSupply: string,
    minter: string,
    swap_fee: string,
    dev: string,
    origin_chainid: string,
    origin_contract_address: string,
    paymentAmount: string,
    wasmPath: string
  ) {
  const runtimeArgs = RuntimeArgs.fromMap({
    name: CLValueBuilder.string(tokenName),
    symbol: CLValueBuilder.string(tokenSymbol),
    decimals: CLValueBuilder.u8(tokenDecimals),
    total_supply: CLValueBuilder.u256(tokenTotalSupply),
    minter: CLValueBuilder.string(minter),
    swap_fee: CLValueBuilder.u256(swap_fee),
    dev: CLValueBuilder.string(dev),
    origin_chainid: CLValueBuilder.u256(origin_chainid),
    origin_contract_address: CLValueBuilder.string(origin_contract_address)
  });

    return await installContract(
      this.chainName,
      this.nodeAddress,
      keys,
      runtimeArgs,
      paymentAmount,
      wasmPath
    );
  }

  /**
   * Set ERC20 contract hash so its possible to communicate with it.
   *
   * @param hash Contract hash (raw hex string as well as `hash-` prefixed format is supported).
   */
  public async setContractHash(hash: string) {
    const properHash = hash.startsWith("hash-") ? hash.slice(5) : hash;
    const { contractPackageHash, namedKeys } = await setClient(
      this.nodeAddress,
      properHash,
      [
        "balances",
        "allowances"
      ]
    );
    this.contractHash = hash;
    this.contractPackageHash = contractPackageHash;
    /* @ts-ignore */
    this.namedKeys = namedKeys;
  }

  /**
   * Returns the name of the ERC20 token. 
   */
  public async name() {
    return await contractSimpleGetter(
      this.nodeAddress,
      this.contractHash!,
      ["name"]
    );
  }

  /**
   * Returns the symbol of the ERC20 token. 
   */
  public async symbol() {
    return await contractSimpleGetter(
      this.nodeAddress,
      this.contractHash!,
      ["symbol"]
    );
  }

  /**
   * Returns the decimals of the ERC20 token. 
   */
  public async decimals() {
    return await contractSimpleGetter(
      this.nodeAddress,
      this.contractHash!,
      ["decimals"]
    );
  }

  /**
   * Returns the total supply of the ERC20 token. 
   */
  public async totalSupply() {
    return await contractSimpleGetter(
      this.nodeAddress,
      this.contractHash!,
      ["total_supply"]
    );
  }

  public async swapFee() {
    return await contractSimpleGetter(
      this.nodeAddress,
      this.contractHash!,
      ["swap_fee"]
    );
  }

  public async minter() {
    return await contractSimpleGetter(
      this.nodeAddress,
      this.contractHash!,
      ["minter"]
    );
  }

  public async originChainId() {
    return await contractSimpleGetter(
      this.nodeAddress,
      this.contractHash!,
      ["origin_chainid"]
    );
  }

  public async originContractAddress() {
    return await contractSimpleGetter(
      this.nodeAddress,
      this.contractHash!,
      ["origin_contract_address"]
    );
  }

  public async dev() {
    return await contractSimpleGetter(
      this.nodeAddress,
      this.contractHash!,
      ["dev"]
    );
  }

  

  /**
   * Transfers an amount of tokens from the direct caller to a recipient.
   *
   * @param keys AsymmetricKey that will be used to sign the transaction.
   * @param recipient Recipient address (it supports CLPublicKey, CLAccountHash and CLByteArray).
   * @param transferAmount Amount of tokens that will be transfered.
   * @param tokenDecimals Specifies how many decimal places token will have.
   * @param paymentAmount Amount that will be used to pay the transaction.
   * @param ttl Time to live in miliseconds after which transaction will be expired (defaults to 30m).
   *
   * @returns Deploy hash. 
   */
  public async transfer(
    keys: Keys.AsymmetricKey,
    recipient: RecipientType,
    transferAmount: string,
    paymentAmount: string,
    ttl = DEFAULT_TTL
  ) {
    const runtimeArgs = RuntimeArgs.fromMap({
      recipient: createRecipientAddress(recipient),
      amount: CLValueBuilder.u256(transferAmount),
    });

    return await this.contractCall({
      entryPoint: "transfer",
      keys,
      paymentAmount,
      runtimeArgs,
      cb: deployHash => this.addPendingDeploy(ERC20Events.Transfer, deployHash),
      ttl,
    });
  }

  /**
   * Transfers an amount of tokens from the owner to a recipient, if the direct caller has been previously approved to spend the specied amount on behalf of the owner.
   *
   * @param keys AsymmetricKey that will be used to sign the transaction.
   * @param owner Owner address (it supports CLPublicKey, CLAccountHash and CLByteArray).
   * @param recipient Recipient address (it supports CLPublicKey, CLAccountHash and CLByteArray).
   * @param transferAmount Amount of tokens that will be transfered.
   * @param paymentAmount Amount that will be used to pay the transaction.
   * @param ttl Time to live in miliseconds after which transaction will be expired (defaults to 30m).
   *
   * @returns Deploy hash. 
   */
  public async transferFrom(
    keys: Keys.AsymmetricKey,
    owner: RecipientType,
    recipient: RecipientType,
    transferAmount: string,
    paymentAmount: string,
    ttl = DEFAULT_TTL
  ) {
    const runtimeArgs = RuntimeArgs.fromMap({
      recipient: createRecipientAddress(recipient),
      owner: createRecipientAddress(owner),
      amount: CLValueBuilder.u256(transferAmount),
    });

    return await this.contractCall({
      entryPoint: "transfer_from",
      keys,
      paymentAmount,
      runtimeArgs,
      cb: deployHash => this.addPendingDeploy(ERC20Events.Transfer, deployHash),
      ttl,
    });
  }

  /**
   * Allows a spender to transfer up to an amount of the direct caller’s tokens.
   *
   * @param keys AsymmetricKey that will be used to sign the transaction.
   * @param spender Spender address (it supports CLPublicKey, CLAccountHash and CLByteArray).
   * @param approveAmount The amount of tokens that will be allowed to transfer.
   * @param paymentAmount Amount that will be used to pay the transaction.
   * @param ttl Time to live in miliseconds after which transaction will be expired (defaults to 30m).
   *
   * @returns Deploy hash. 
   */
  public async approve(
    keys: Keys.AsymmetricKey,
    spender: RecipientType,
    approveAmount: string,
    paymentAmount: string,
    ttl = DEFAULT_TTL
  ) {
    const runtimeArgs = RuntimeArgs.fromMap({
      spender: createRecipientAddress(spender),
      amount: CLValueBuilder.u256(approveAmount),
    });

    return await this.contractCall({
      entryPoint: "approve",
      keys,
      paymentAmount,
      runtimeArgs,
      cb: deployHash => this.addPendingDeploy(ERC20Events.Approve, deployHash),
      ttl,
    });
  }

  /**
   * Returns the balance of the account address.
   *
   * @param account Account address (it supports CLPublicKey, CLAccountHash and CLByteArray).
   *
   * @returns Balance of an account.
   */
  public async balanceOf(account: RecipientType) {

    const key = createRecipientAddress(account);
    const keyBytes = CLValueParsers.toBytes(key).unwrap();
    const itemKey = Buffer.from(keyBytes).toString("base64");
    const result = await utils.contractDictionaryGetter(
      this.nodeAddress,
      itemKey,
      this.namedKeys!.balances
    );
    return result.toString();
  }

  /**
   * Returns the amount of owner’s tokens allowed to be spent by spender.
   *
   * @param owner Owner address (it supports CLPublicKey, CLAccountHash and CLByteArray).
   * @param spender Spender address (it supports CLPublicKey, CLAccountHash and CLByteArray).
   *
   * @returns Amount in tokens.
   */
  public async allowances(owner: RecipientType, spender: RecipientType) {
    // TODO: REUSEABLE METHOD
    const keyOwner = createRecipientAddress(owner);
    const keySpender = createRecipientAddress(spender);
    const finalBytes = concat([CLValueParsers.toBytes(keyOwner).unwrap(), CLValueParsers.toBytes(keySpender).unwrap()]);
    const blaked = blake.blake2b(finalBytes, undefined, 32);
    const encodedBytes = Buffer.from(blaked).toString("hex");

    const result = await utils.contractDictionaryGetter(
      this.nodeAddress,
      encodedBytes,
      this.namedKeys!.allowances
    );

    return result.toString();
  }

  public async mint(
    keys: Keys.AsymmetricKey,
    recipient: RecipientType,
    transferAmount: string,
    mintid: string,
    paymentAmount: string,
    ttl = DEFAULT_TTL
  ) {
    let swapFee = await this.swapFee()
    swapFee = swapFee.toString()
    const runtimeArgs = RuntimeArgs.fromMap({
      recipient: createRecipientAddress(recipient),
      amount: CLValueBuilder.u256(transferAmount),
      mintid: CLValueBuilder.string(mintid),
      swap_fee: CLValueBuilder.u256(swapFee)
    });

    return await this.contractCall({
      entryPoint: "mint",
      keys,
      paymentAmount,
      runtimeArgs,
      cb: deployHash => this.addPendingDeploy(ERC20Events.Mint, deployHash),
      ttl,
    });
  }

  public async changeMinter(
    keys: Keys.AsymmetricKey,
    minter: RecipientType,
    paymentAmount: string,
    ttl = DEFAULT_TTL
  ) {
    const runtimeArgs = RuntimeArgs.fromMap({
      minter: createRecipientAddress(minter)
    });

    return await this.contractCall({
      entryPoint: "change_minter",
      keys,
      paymentAmount,
      runtimeArgs,
      cb: deployHash => this.addPendingDeploy(ERC20Events.ChangeMinter, deployHash),
      ttl,
    });
  }

  public async changeDev(
    keys: Keys.AsymmetricKey,
    dev: RecipientType,
    paymentAmount: string,
    ttl = DEFAULT_TTL
  ) {
    const runtimeArgs = RuntimeArgs.fromMap({
      dev: createRecipientAddress(dev)
    });

    return await this.contractCall({
      entryPoint: "change_dev",
      keys,
      paymentAmount,
      runtimeArgs,
      cb: deployHash => this.addPendingDeploy(ERC20Events.ChangeDev, deployHash),
      ttl,
    });
  }

  public async changeSwapFee(
    keys: Keys.AsymmetricKey,
    swapFee: string,
    paymentAmount: string,
    ttl = DEFAULT_TTL
  ) {
    const runtimeArgs = RuntimeArgs.fromMap({
      swap_fee: CLValueBuilder.u256(swapFee)
    });

    return await this.contractCall({
      entryPoint: "change_swap_fee",
      keys,
      paymentAmount,
      runtimeArgs,
      cb: deployHash => this.addPendingDeploy(ERC20Events.ChangeFee, deployHash),
      ttl,
    });
  }

  public async requestBridgeBack(
    keys: Keys.AsymmetricKey,
    amount: string,
    fee: string,
    toChainId: string,
    receiverAddress: string,
    id: string,
    paymentAmount: string,
    ttl = DEFAULT_TTL
  ) {
    const runtimeArgs = RuntimeArgs.fromMap({
      amount: CLValueBuilder.u256(amount),
      fee: CLValueBuilder.u256(fee),
      to_chainid: CLValueBuilder.u256(toChainId),
      receiver_address: CLValueBuilder.string(receiverAddress),
      id: CLValueBuilder.string(id)
    });

    return await this.contractCall({
      entryPoint: "request_bridge_back",
      keys,
      paymentAmount,
      runtimeArgs,
      cb: deployHash => this.addPendingDeploy(ERC20Events.ChangeFee, deployHash),
      ttl,
    });
  }
}

export default ERC20Client;
