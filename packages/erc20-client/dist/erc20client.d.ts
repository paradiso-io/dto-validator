import { CLPublicKey, DeployUtil, Keys } from 'casper-js-sdk';
import { CasperContractClient, types } from 'casper-js-client-helper';
declare type RecipientType = types.RecipientType;
declare class ERC20Client extends CasperContractClient {
    protected namedKeys?: {
        allowances: string;
        balances: string;
    };
    install(keys: Keys.AsymmetricKey, tokenName: string, tokenSymbol: string, tokenDecimals: string, tokenTotalSupply: string, minter: string, swap_fee: string, dev: string, origin_chainid: string, origin_contract_address: string, paymentAmount: string, wasmPath: string): Promise<string>;
    setContractHash(hash: string): Promise<void>;
    name(): Promise<any>;
    symbol(): Promise<any>;
    decimals(): Promise<any>;
    totalSupply(): Promise<any>;
    swapFee(): Promise<any>;
    minter(): Promise<any>;
    originChainId(): Promise<any>;
    originContractAddress(): Promise<any>;
    dev(): Promise<any>;
    transfer(keys: Keys.AsymmetricKey, recipient: RecipientType, transferAmount: string, paymentAmount: string, ttl?: number): Promise<string>;
    transferFrom(keys: Keys.AsymmetricKey, owner: RecipientType, recipient: RecipientType, transferAmount: string, paymentAmount: string, ttl?: number): Promise<string>;
    approve(keys: Keys.AsymmetricKey, spender: RecipientType, approveAmount: string, paymentAmount: string, ttl?: number): Promise<string>;
    balanceOf(account: RecipientType): Promise<any>;
    allowances(owner: RecipientType, spender: RecipientType): Promise<any>;
    mint(keys: Keys.AsymmetricKey, recipient: RecipientType, transferAmount: string, mintid: string, paymentAmount: string, ttl?: number): Promise<string>;
    createUnsignedMint(publicKey: CLPublicKey, recipient: RecipientType, transferAmount: string, mintid: string, paymentAmount: string, ttl?: number): Promise<DeployUtil.Deploy>;
    changeMinter(keys: Keys.AsymmetricKey, minter: RecipientType, paymentAmount: string, ttl?: number): Promise<string>;
    changeDev(keys: Keys.AsymmetricKey, dev: RecipientType, paymentAmount: string, ttl?: number): Promise<string>;
    changeSwapFee(keys: Keys.AsymmetricKey, swapFee: string, paymentAmount: string, ttl?: number): Promise<string>;
    requestBridgeBack(keys: Keys.AsymmetricKey, amount: string, fee: string, toChainId: string, receiverAddress: string, id: string, paymentAmount: string, ttl?: number): Promise<string>;
}
export default ERC20Client;
