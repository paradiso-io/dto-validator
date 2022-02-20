import { CLPublicKey, CasperClient, Contracts, Keys, CLKeyParameters } from "casper-js-sdk";
export interface CEP47InstallArgs {
    name: string;
    contractName: string;
    symbol: string;
    meta: Map<string, string>;
}
export declare enum CEP47Events {
    MintOne = "cep47_mint_one",
    TransferToken = "cep47_transfer_token",
    BurnOne = "cep47_burn_one",
    MetadataUpdate = "cep47_metadata_update",
    ApproveToken = "cep47_approve_token"
}
export declare const CEP47EventParser: ({ contractPackageHash, eventNames, }: {
    contractPackageHash: string;
    eventNames: CEP47Events[];
}, value: any) => {
    error: any;
    success: boolean;
    data: any;
};
export declare class CEP47Client {
    nodeAddress: string;
    networkName: string;
    casperClient: CasperClient;
    contractClient: Contracts.Contract;
    constructor(nodeAddress: string, networkName: string);
    install(wasm: Uint8Array, args: CEP47InstallArgs, paymentAmount: string, deploySender: CLPublicKey, keys?: Keys.AsymmetricKey[]): import("casper-js-sdk/dist/lib/DeployUtil").Deploy;
    setContractHash(contractHash: string, contractPackageHash?: string): void;
    name(): Promise<import("casper-js-sdk/dist/lib/StoredValue").StoredValue>;
    symbol(): Promise<import("casper-js-sdk/dist/lib/StoredValue").StoredValue>;
    meta(): Promise<import("casper-js-sdk/dist/lib/StoredValue").StoredValue>;
    totalSupply(): Promise<import("casper-js-sdk/dist/lib/StoredValue").StoredValue>;
    balanceOf(account: CLPublicKey): Promise<any>;
    getOwnerOf(tokenId: string): Promise<string>;
    getTokenMeta(tokenId: string): Promise<Map<any, any>>;
    getTokenByIndex(owner: CLPublicKey, index: string): Promise<any>;
    getIndexByToken(owner: CLKeyParameters, tokenId: string): Promise<any>;
    getAllowance(owner: CLKeyParameters, tokenId: string): Promise<string>;
    approve(spender: CLKeyParameters, ids: string[], paymentAmount: string, deploySender: CLPublicKey, keys?: Keys.AsymmetricKey[]): Promise<import("casper-js-sdk/dist/lib/DeployUtil").Deploy>;
    mint(recipient: CLKeyParameters, ids: string[], metas: Map<string, string>[], paymentAmount: string, deploySender: CLPublicKey, keys?: Keys.AsymmetricKey[]): Promise<import("casper-js-sdk/dist/lib/DeployUtil").Deploy>;
    mintCopies(recipient: CLKeyParameters, ids: string[], meta: Map<string, string>, count: number, paymentAmount: string, deploySender: CLPublicKey, keys?: Keys.AsymmetricKey[]): Promise<import("casper-js-sdk/dist/lib/DeployUtil").Deploy>;
    burn(owner: CLKeyParameters, ids: string[], paymentAmount: string, deploySender: CLPublicKey, keys?: Keys.AsymmetricKey[]): Promise<import("casper-js-sdk/dist/lib/DeployUtil").Deploy>;
    transferFrom(recipient: CLKeyParameters, owner: CLKeyParameters, ids: string[], paymentAmount: string, deploySender: CLPublicKey, keys?: Keys.AsymmetricKey[]): Promise<import("casper-js-sdk/dist/lib/DeployUtil").Deploy>;
    transfer(recipient: CLKeyParameters, ids: string[], paymentAmount: string, deploySender: CLPublicKey, keys?: Keys.AsymmetricKey[]): Promise<import("casper-js-sdk/dist/lib/DeployUtil").Deploy>;
    updateTokenMeta(id: string, meta: Map<string, string>, paymentAmount: string, deploySender: CLPublicKey, keys?: Keys.AsymmetricKey[]): Promise<import("casper-js-sdk/dist/lib/DeployUtil").Deploy>;
}
