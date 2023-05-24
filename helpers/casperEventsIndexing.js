const {
    CLPublicKey,
    CLKey,
    RuntimeArgs,
    CLValueBuilder,
    CLValueParsers,
    CLTypeTag
} = require("casper-js-sdk");
const {
    utils,
    helpers,
    CasperContractClient,
} = require("casper-js-client-helper");
const logger = require('../helpers/logger')
const { setClient, contractSimpleGetter, createRecipientAddress } = helpers;
const { concat } = require("@ethersproject/bytes");
const blake = require("blakejs");

const DEFAULT_TTL = 1800000;

const DTOWrappedCep78Event = {
    approve_to_claim: ["contract_package_hash", "event_type", "nft_contract", "token_id", "offeror", "minimum_offer", "is_active"],
    claim: ["contract_package_hash", "event_type", "nft_contract", "token_id", "offeror", "minimum_offer", "is_active"],
    request_bridge_back: ["contract_package_hash", "event_type", "nft_contract", "token_id", "offeror", "buyer", "value"],
}

const DTOBridgeEvent = {
    request_bridge_nft: ["contract_package_hash", "event_type", "nft_contract", "token_ids", "from", "to", "request_id", "request_index"],
    unlock_nft: ["contract_package_hash", "event_type", "nft_contract", "token_ids", "from", "to", "unlock_id"]
}

const EventsCep47Parser = (
    {
        contractPackageHash, // array of contractPgkHash
        eventNames,
    },
    value
) => {
    logger.warn('parsing deploy %s', value.execution_result)
    if (value.execution_result.result.Success) {
        const { transforms } =
            value.execution_result.result.Success.effect;

        const cep47Events = transforms.reduce((acc, val) => {
            if (
                val.transform.hasOwnProperty("WriteCLValue") &&
                typeof val.transform.WriteCLValue.parsed === "object" &&
                val.transform.WriteCLValue.parsed !== null
            ) {
                const maybeCLValue = CLValueParsers.fromJSON(
                    val.transform.WriteCLValue
                );
                const clValue = maybeCLValue.unwrap();
                if (clValue && clValue.clType().tag === CLTypeTag.Map) {
                    const hash = (clValue).get(
                        CLValueBuilder.string("contract_package_hash")
                    );
                    const event = (clValue).get(CLValueBuilder.string("event_type"));
                    console.log('hash', hash)
                    console.log(hash.data, contractPackageHash, hash.data === contractPackageHash)
                    if (
                        hash &&
                        // NOTE: Calling toLowerCase() because current JS-SDK doesn't support checksumed hashes and returns all lower case value
                        // Remove it after updating SDK
                        (hash.data === contractPackageHash) &&
                        event &&
                        eventNames.includes(event.data)
                    ) {
                        console.log("here 1")
                        const data = {}
                        for (const c of clValue.data) {
                            data[c[0].data] = c[1].data
                        }
                        // check whether data has enough fields
                        const requiredFields = DTOBridgeEvent[event.value().toLowerCase()]
                        const good = true
                        for (const f of requiredFields) {
                            if (!data[f]) {
                                logger.warn('cannot find field %s', f)
                                good = false
                                break
                            }
                        }
                        if (good) {
                            acc = [...acc, { name: event.value(), data, contractPackageHash: hash.value().toString() }];
                        }
                    }
                }
            }
            return acc;
        }, []);

        return { error: null, success: !!cep47Events.length, data: cep47Events };
    }

    return null;
};

const keyAndValueToHex = (key, value) => {
    const aBytes = CLValueParsers.toBytes(key).unwrap();
    const bBytes = CLValueParsers.toBytes(value).unwrap();

    const blaked = blake.blake2b(concat([aBytes, bBytes]), undefined, 32);
    const hex = Buffer.from(blaked).toString('hex');

    return hex;
}

const CEP78 = class {
    constructor(contractHash, nodeAddress, chainName, namedKeysList = []) {
        this.contractHash = contractHash.startsWith("hash-")
            ? contractHash.slice(5)
            : contractHash;
        this.nodeAddress = nodeAddress;
        this.chainName = chainName;
        this.contractClient = new CasperContractClient(nodeAddress, chainName);
        this.namedKeysList = [
            "balances",
            "burnt_tokens",
            "metadata_cep78",
            "metadata_custom_validated",
            "metadata_nft721",
            "metadata_raw",
            "operators",
            "owned_tokens",
            "token_issuers",
            "page_table",
            "page_0",
            "page_1",
            "page_2",
            "page_3",
            "page_4",
            "page_5",
            "page_6",
            "page_7",
            "page_8",
            "page_9",
            "page_10",
            "user_mint_id_list",
            "hash_by_index",
            "events",
            "index_by_hash",
            "receipt_name",
            "rlo_mflag",
            "reporting_mode",
            // "token_owners",

        ];
        this.namedKeysList.push(...namedKeysList)

    }

    static async createInstance(contractHash, nodeAddress, chainName, namedKeysList = []) {
        let wNFT = new CEP78(contractHash, nodeAddress, chainName, namedKeysList);
        await wNFT.init();
        return wNFT;
    }

    NFTMetadataKind = {
        CEP78: 0,
        NFT721: 1,
        Raw: 2,
        CustomValidated: 3,
    };

    async init() {
        const { contractPackageHash, namedKeys } = await setClient(
            this.nodeAddress,
            this.contractHash,
            this.namedKeysList
        );
        this.contractPackageHash = contractPackageHash;
        this.contractClient.chainName = this.chainName
        this.contractClient.contractHash = this.contractHash
        this.contractClient.contractPackageHash = this.contractPackageHash
        this.contractClient.nodeAddress = this.nodeAddress
        /* @ts-ignore */
        this.namedKeys = namedKeys;
        console.log(this.namedKeys)
    }

    async identifierMode() {
        let mode = await contractSimpleGetter(this.nodeAddress, this.contractHash, [
            "identifier_mode",
        ]);
        return mode.toNumber()
    }

    async collectionName() {
        return await this.readContractField("collection_name");
    }

    async allowMinting() {
        return await this.readContractField("allow_minting");
    }

    async collectionSymbol() {
        return await this.readContractField("collection_symbol");
    }

    async contractWhitelist() {
        return await this.readContractField("contract_whitelist");
    }

    async holderMode() {
        return await this.readContractField("holder_mode");
    }

    async installer() {
        return await this.readContractField("installer");
    }

    async jsonSchema() {
        return await this.readContractField("json_schema");
    }

    async metadataMutability() {
        return await this.readContractField("metadata_mutability");
    }

    async mintingMode() {
        return await this.readContractField("minting_mode");
    }

    async nftKind() {
        return await this.readContractField("nft_kind");
    }

    async nftMetadataKind() {
        return await this.readContractField("nft_metadata_kind");
    }

    async numberOfMintedTokens() {
        return await this.readContractField("number_of_minted_tokens");
    }

    async ownershipMode() {
        return await this.readContractField("ownership_mode");
    }

    async receiptName() {
        return await this.readContractField("receipt_name");
    }

    async totalTokenSupply() {
        return await this.readContractField("total_token_supply");
    }

    async whitelistMode() {
        return await this.readContractField("whitelist_mode");
    }

    async readContractField(field) {
        return await contractSimpleGetter(this.nodeAddress, this.contractHash, [
            field,
        ]);
    }

    async getOperator(tokenId) {
        try {
            const itemKey = tokenId.toString();
            const result = await utils.contractDictionaryGetter(
                this.nodeAddress,
                itemKey,
                this.namedKeys.operator
            );
            return Buffer.from(result.val.data.data).toString("hex");
        } catch (e) {
            throw e;
        }
    }

    async getOwnerOf(tokenId) {
        try {
            const itemKey = tokenId.toString();
            const result = await utils.contractDictionaryGetter(
                this.nodeAddress,
                itemKey,
                this.namedKeys.tokenOwners
            );
            return Buffer.from(result.data).toString("hex");
        } catch (e) {
            throw e;
        }
    }

    async burntTokens(tokenId) {
        try {
            const itemKey = tokenId.toString();
            const result = await utils.contractDictionaryGetter(
                this.nodeAddress,
                itemKey,
                this.namedKeys.burntTokens
            );
            return result ? true : false;
        } catch (e) { }
        return false;
    }

    async getTokenMetadata(tokenId) {
        try {
            const itemKey = tokenId.toString();
            let nftMetadataKind = await this.nftMetadataKind();
            nftMetadataKind = parseInt(nftMetadataKind.toString());
            let result = null;
            console.log("---", nftMetadataKind)
            console.log(this.namedKeys.metadataCep78)
            if (nftMetadataKind == this.NFTMetadataKind.CEP78) {
                result = await utils.contractDictionaryGetter(
                    this.nodeAddress,
                    itemKey,
                    this.namedKeys.metadataCep78
                );
            } else if (nftMetadataKind == this.NFTMetadataKind.CustomValidated) {
                result = await utils.contractDictionaryGetter(
                    this.nodeAddress,
                    itemKey,
                    this.namedKeys.metadataCustomValidated
                );
            } else if (nftMetadataKind == this.NFTMetadataKind.NFT721) {
                result = await utils.contractDictionaryGetter(
                    this.nodeAddress,
                    itemKey,
                    this.namedKeys.metadataNft721
                );
            } else if (nftMetadataKind == this.NFTMetadataKind.Raw) {
                result = await utils.contractDictionaryGetter(
                    this.nodeAddress,
                    itemKey,
                    this.namedKeys.metadataRaw
                );
            }
            // } else if (nftMetadataKind == this.NFTMetadataKind.CasperPunk) {
            //     console.log(this.namedKeys.metadataCasperpunk)
            //     result = await utils.contractDictionaryGetter(
            //         this.nodeAddress,
            //         itemKey,
            //         this.namedKeys.metadataCasperpunk
            //         //"uref-d97097a04ee5957aacb78859843476b01290fd39bb81cd32d6e5d4a66e2593ee-007"
            //     );
            // }


            return result;
        } catch (e) {
            throw e;
        }
    }

    static getAccountItemKey(account) {
        let itemKey = "";
        if (typeof account == String) {
            itemKey = account.toString();
        } else {
            let key = createRecipientAddress(account);
            itemKey = Buffer.from(key.data.data).toString("hex");
        }
        return itemKey;
    }

    async getOwnedTokens(account) {
        try {
            let itemKey = CEP78.getAccountItemKey(account);
            const result = await utils.contractDictionaryGetter(
                this.nodeAddress,
                itemKey,
                this.namedKeys.ownedTokens
            );
            return result.map((e) => e.data);
        } catch (e) {
            throw e;
        }
    }

    async userMintIdList(account) {
        try {
            let itemKey = CEP78.getAccountItemKey(account);
            console.log("itemKey ", itemKey)
            console.log("here", this.namedKeys.userMintIdList)
            const result = await utils.contractDictionaryGetter(
                this.nodeAddress,
                itemKey,
                this.namedKeys.userMintIdList
            );
            console.log("result", result)
            return result;
        } catch (e) {
            throw e;
        }
    }

    async balanceOf(account) {
        try {
            let itemKey = CEP78.getAccountItemKey(account);
            const result = await utils.contractDictionaryGetter(
                this.nodeAddress,
                itemKey,
                this.namedKeys.balances
            );
            return result;
        } catch (e) {
            throw e;
        }
    }

    async getOwnedTokenIds(account) {
        let table = []
        try {
            let itemKey = CEP78.getAccountItemKey(account);
            console.log(this.namedKeys.pageTable)
            const result = await utils.contractDictionaryGetter(
                this.nodeAddress,
                itemKey,
                this.namedKeys.pageTable
            );


            for (var i = 0; i < result.length; i++) {
                if (result[i].data == true) {
                    table.push(i)
                }
            }

            let tokenIds = []

            for (var j = 0; j < table.length; j++) {

                let k = table[j]

                let numberOfPage = "page_" + k
                console.log(numberOfPage.toString())
                const result = await utils.contractDictionaryGetter(
                    this.nodeAddress,
                    itemKey,
                    this.namedKeys[numberOfPage]
                );
                for (var i = 0; i < result.length; i++) {
                    if (result[i].data == true) {
                        tokenIds.push(i)
                    }
                }

            }
            return tokenIds;
            // return table;
        } catch (e) {
            throw e;
        }


    }

    async getOwnedTokenIdsHash(account) {
        let table = []
        try {
            let itemKey = CEP78.getAccountItemKey(account);
            console.log(this.namedKeys.pageTable)
            const result = await utils.contractDictionaryGetter(
                this.nodeAddress,
                itemKey,
                this.namedKeys.pageTable
            );


            for (var i = 0; i < result.length; i++) {
                if (result[i].data == true) {
                    table.push(i)
                }
            }

            let tokenIds = []

            for (var j = 0; j < table.length; j++) {

                let k = table[j]

                let numberOfPage = "page_" + k
                console.log(numberOfPage.toString())
                const result = await utils.contractDictionaryGetter(
                    this.nodeAddress,
                    itemKey,
                    this.namedKeys[numberOfPage]
                );
                for (var i = 0; i < result.length; i++) {
                    if (result[i].data == true) {
                        tokenIds.push(i)
                    }
                }

            }
            let final = []
            console.log("tokenIds ", tokenIds)
            for (var m = 0; m < tokenIds.length; m++) {
                let string = tokenIds[m].toString()

                console.log(tokenIds[m])
                console.log(this.namedKeys.hashByIndex)
                const result = await utils.contractDictionaryGetter(
                    this.nodeAddress,
                    string,
                    this.namedKeys.hashByIndex
                );
                final.push(result)
            }
            return final;
            // return table;
        } catch (e) {
            throw e;
        }


    }
    async pageTable(account) {
        try {
            let itemKey = CEP78.getAccountItemKey(account);
            console.log(this.namedKeys.pageTable)
            const result = await utils.contractDictionaryGetter(
                this.nodeAddress,
                itemKey,
                this.namedKeys.pageTable
            );

            let table = []

            for (var i = 0; i < result.length; i++) {
                if (result[i].data == true) {
                    table.push(i)
                }
            }
            return table;
        } catch (e) {
            throw e;
        }
    }
    async pageDetails(i, account) {
        try {
            let itemKey = CEP78.getAccountItemKey(account);
            let numberOfPage = "page_" + i
            console.log(numberOfPage.toString())
            console.log(this.namedKeys.page_0)
            const result = await utils.contractDictionaryGetter(
                this.nodeAddress,
                itemKey,
                this.namedKeys[numberOfPage]
            );
            // console.log(result)


            let tokenIds = []

            for (var i = 0; i < result.length; i++) {
                if (result[i].data == true) {
                    tokenIds.push(i)
                }
            }
            return tokenIds;
        } catch (e) {
            throw e;
        }
    }


    async approve(keys, operator, tokenId, paymentAmount, ttl) {
        let key = createRecipientAddress(operator);
        let identifierMode = await this.identifierMode();
        identifierMode = parseInt(identifierMode.toString());
        let runtimeArgs = {};
        if (identifierMode == 0) {
            runtimeArgs = RuntimeArgs.fromMap({
                token_id: CLValueBuilder.u64(parseInt(tokenId)),
                operator: key,
            });
        } else {
            runtimeArgs = RuntimeArgs.fromMap({
                token_hash: CLValueBuilder.string(tokenId),
                operator: key,
            });
        }

        return await this.contractClient.contractCall({
            entryPoint: "approve",
            keys: keys,
            paymentAmount: paymentAmount ? paymentAmount : "1000000000",
            runtimeArgs,
            cb: () => { },
            ttl: ttl ? ttl : DEFAULT_TTL,
        });
    }

    async mint({ keys, tokenOwner, metadataJson, paymentAmount, ttl }) {
        // Owner input is accountHash
        tokenOwner = tokenOwner.startsWith("account-hash-")
            ? tokenOwner.slice(13)
            : tokenOwner;


        let ownerAccountHashByte = Uint8Array.from(
            Buffer.from(tokenOwner, 'hex'),
        )


        const ownerKey = createRecipientAddress(new CLAccountHash(ownerAccountHashByte))


        let token_metadata = new CLString(JSON.stringify(metadataJson))
        let runtimeArgs = {};
        runtimeArgs = RuntimeArgs.fromMap({
            token_owner: ownerKey,
            token_meta_data: token_metadata,
        });

        console.log(runtimeArgs)

        return await this.contractClient.contractCall({
            entryPoint: "mint",
            keys: keys,
            paymentAmount: paymentAmount ? paymentAmount : "10000000000",
            runtimeArgs,
            cb: () => { },
            ttl: ttl ? ttl : DEFAULT_TTL,
        });
    }

    async mintBoxx({ keys, tokenOwners, numberOfBoxs, metadataJson, paymentAmount, ttl }) {

        let tokenOwnerArray = CLValueBuilder.list(tokenOwners.map(owner => createRecipientAddress(CLPublicKey.fromHex(owner))))

        let numberOfBoxArray = CLValueBuilder.list(numberOfBoxs.map(number => CLValueBuilder.u8(number)))
        let token_metadata = new CLString(JSON.stringify(metadataJson))
        let runtimeArgs = {};
        runtimeArgs = RuntimeArgs.fromMap({
            token_owners: tokenOwnerArray,
            token_meta_data: token_metadata,
            number_of_boxs: numberOfBoxArray
        });
        return await this.contractClient.contractCall({
            entryPoint: "mint",
            keys: keys,
            paymentAmount: paymentAmount ? paymentAmount : "120000000000",
            runtimeArgs,
            cb: () => { },
            ttl: ttl ? ttl : DEFAULT_TTL,
        });
    }
    async setParams({ keys, mintingStart, mintingEnd, mintingPrice, paymentAmount, ttl }) {


        let runtimeArgs = {};
        runtimeArgs = RuntimeArgs.fromMap({
            minting_start_time: CLValueBuilder.u64(mintingStart),
            minting_end_time: CLValueBuilder.u64(mintingEnd),
            minting_price: CLValueBuilder.u256(mintingPrice)
        });

        console.log(runtimeArgs)

        return await this.contractClient.contractCall({
            entryPoint: "update_mint_params",
            keys: keys,
            paymentAmount: paymentAmount ? paymentAmount : "10000000000",
            runtimeArgs,
            cb: () => { },
            ttl: ttl ? ttl : DEFAULT_TTL,
        });
    }

    async claim({ keys, paymentAmount, ttl }) {
        // Owner input is accountHash
        // tokenOwner = tokenOwner.startsWith("account-hash-")
        //     ? tokenOwner.slice(13)
        //     : tokenOwner;


        // let ownerAccountHashByte = Uint8Array.from(
        //     Buffer.from(tokenOwner, 'hex'),
        // )


        // const ownerKey = createRecipientAddress(new CLAccountHash(ownerAccountHashByte))


        // let token_metadata = new CLString(JSON.stringify(metadataJson))
        let runtimeArgs = {};
        runtimeArgs = RuntimeArgs.fromMap({
            // token_owner: ownerKey,
            // token_meta_data: token_metadata,
        });

        console.log(runtimeArgs)

        return await this.contractClient.contractCall({
            entryPoint: "claim",
            keys: keys,
            paymentAmount: paymentAmount ? paymentAmount : "30000000000",
            runtimeArgs,
            cb: () => { },
            ttl: ttl ? ttl : DEFAULT_TTL,
        });
    }

    async registerOwner({ keys, tokenOwner, paymentAmount, ttl }) {

        const ownerKey = createRecipientAddress(CLPublicKey.fromHex(tokenOwner))
        let runtimeArgs = {};
        runtimeArgs = RuntimeArgs.fromMap({
            token_owner: ownerKey,
            // token_meta_data: token_metadata,
        });

        console.log("before")
        return await this.contractClient.contractCall({
            entryPoint: "register_owner",
            keys: keys,
            paymentAmount: paymentAmount ? paymentAmount : "1000000000",
            runtimeArgs,
            cb: () => { },
            ttl: ttl ? ttl : DEFAULT_TTL,
        });
    }
    async registerOwnerForContract({ keys, contractHash, paymentAmount, ttl }) {
        contractHash = new CLByteArray(
            Uint8Array.from(Buffer.from(contractHash, "hex"))
        );

        const ownerKey = createRecipientAddress(contractHash)
        let runtimeArgs = {};
        runtimeArgs = RuntimeArgs.fromMap({
            token_owner: ownerKey,
            // token_meta_data: token_metadata,
        });

        console.log("before")
        return await this.contractClient.contractCall({
            entryPoint: "register_owner",
            keys: keys,
            paymentAmount: paymentAmount ? paymentAmount : "1000000000",
            runtimeArgs,
            cb: () => { },
            ttl: ttl ? ttl : DEFAULT_TTL,
        });
    }
    async mintOfficial({ keys, tokenOwner, metadataJson, paymentAmount, ttl }) {
        // Owner input is accountHash
        // tokenOwner = tokenOwner.startsWith("account-hash-")
        //     ? tokenOwner.slice(13)
        //     : tokenOwner;


        // let ownerAccountHashByte = Uint8Array.from(
        //     Buffer.from(tokenOwner, 'hex'),
        // )


        const ownerKey = createRecipientAddress(CLPublicKey.fromHex(tokenOwner))
        let hashesMap = ["32"]
        let a = CLValueParsers.toBytes(ownerKey)
        console.log("a ", a)

        let token_metadata = CLValueBuilder.list(metadataJson.map(id => CLValueBuilder.string(id)))
        let hashes = CLValueBuilder.list(hashesMap.map(hash => CLValueBuilder.string(hash)))

        // let token_metadata = new CLString(JSON.stringify(metadataJson))
        let runtimeArgs = {};
        runtimeArgs = RuntimeArgs.fromMap({
            token_owner: ownerKey,
            token_meta_datas: token_metadata,
            token_hashes: hashes,
            // mint_id: CLValueBuilder.string(mintId)
        });

        console.log("before")
        return await this.contractClient.contractCall({
            entryPoint: "mint",
            keys: keys,
            paymentAmount: paymentAmount ? paymentAmount : "22000000000",
            runtimeArgs,
            cb: () => { },
            ttl: ttl ? ttl : DEFAULT_TTL,
        });
    }
    async mintBox({ keys, tokenOwner, metadataJson, paymentAmount, ttl }) {

        const ownerKey = createRecipientAddress(CLPublicKey.fromHex(tokenOwner))
        // let token_metadata = CLValueBuilder.list(metadataJson.map(id => CLValueBuilder.string(id)))
        // let hashes = CLValueBuilder.list(hashesMap.map(hash => CLValueBuilder.string(hash)))

        let token_metadata = new CLString(JSON.stringify(metadataJson))
        let runtimeArgs = {};
        runtimeArgs = RuntimeArgs.fromMap({
            token_owner: ownerKey,
            token_meta_data: token_metadata,
        });

        console.log("before")
        return await this.contractClient.contractCall({
            entryPoint: "mint",
            keys: keys,
            paymentAmount: paymentAmount ? paymentAmount : "22000000000",
            runtimeArgs,
            cb: () => { },
            ttl: ttl ? ttl : DEFAULT_TTL,
        });
    }
    async setWhitelist({ keys, whitelistedUsers, paymentAmount, ttl }) {
        let addressesWhitelistArr = whitelistedUsers.map((e) => CLValueBuilder.string(e));
        let arr = []
        for (let i = 0; i < addressesWhitelistArr.length; i++) {
            whitelistedUsers[i] = CLPublicKey.fromHex(whitelistedUsers[i])
            whitelistedUsers[i] = createRecipientAddress(whitelistedUsers[i])
            arr.push(whitelistedUsers[i])

        }
        console.log("ARR length: ", arr.length)
        // console.log("arr: ", arr)

        let runtimeArgs = {};
        runtimeArgs = RuntimeArgs.fromMap({
            whitelisted_users: CLValueBuilder.list(arr),
            whitelisted_users1: CLValueBuilder.string(arr.join("-")),
            whitelisted_users2: CLValueBuilder.string(arr.join("-")),
        });

        console.log("before")
        return await this.contractClient.contractCall({
            entryPoint: "set_whitelist",
            keys: keys,
            paymentAmount: paymentAmount ? paymentAmount : "6000000000",
            runtimeArgs,
            cb: () => { },
            ttl: ttl ? ttl : DEFAULT_TTL,
        });
    }

    // test approve to claim
    async approveToClaim({ keys, tokenOwner, mintId, metadataJson, paymentAmount, ttl }) {

        const ownerKey = createRecipientAddress(CLPublicKey.fromHex(tokenOwner))
        let hashesMap = ["64"]

        let token_metadata = CLValueBuilder.list(metadataJson.map(id => CLValueBuilder.string(id)))
        let hashes = CLValueBuilder.list(hashesMap.map(hash => CLValueBuilder.string(hash)))

        // let token_metadata = new CLString(JSON.stringify(metadataJson))
        let runtimeArgs = {};
        runtimeArgs = RuntimeArgs.fromMap({
            token_owner: ownerKey,
            token_meta_datas: token_metadata,
            mint_id: mintId,
            token_hashes: hashes
        });

        console.log("before")
        return await this.contractClient.contractCall({
            entryPoint: "approve_to_claim",
            keys: keys,
            paymentAmount: paymentAmount ? paymentAmount : "22000000000",
            runtimeArgs,
            cb: () => { },
            ttl: ttl ? ttl : DEFAULT_TTL,
        });
    }

    async approveForAll(keys, operator, paymentAmount, ttl) {
        let key = createRecipientAddress(operator);
        let runtimeArgs = RuntimeArgs.fromMap({
            operator: key,
        });

        return await this.contractClient.contractCall({
            entryPoint: "set_approval_for_all",
            keys: keys,
            paymentAmount: paymentAmount ? paymentAmount : "1000000000",
            runtimeArgs,
            cb: () => { },
            ttl: ttl ? ttl : DEFAULT_TTL,
        });
    }

    async burn(keys, tokenId, paymentAmount, ttl) {
        let identifierMode = await this.identifierMode();
        identifierMode = parseInt(identifierMode.toString());
        let runtimeArgs = {};
        if (identifierMode == 0) {
            runtimeArgs = RuntimeArgs.fromMap({
                token_id: CLValueBuilder.u64(parseInt(tokenId)),
            });
        } else {
            runtimeArgs = RuntimeArgs.fromMap({
                token_hash: CLValueBuilder.string(tokenId),
            });
        }

        return await this.contractClient.contractCall({
            entryPoint: "burn",
            keys: keys,
            paymentAmount: paymentAmount ? paymentAmount : "1000000000",
            runtimeArgs,
            cb: () => { },
            ttl: ttl ? ttl : DEFAULT_TTL,
        });
    }

    async checkOperatorDictionaryKey(caller, operator) {
        try {
            let callerKey = createRecipientAddress(CLPublicKey.fromHex(caller))
            const contracthashbytearray = new CLByteArray(Uint8Array.from(Buffer.from(operator, 'hex')));
            const operatorKey = new CLKey(contracthashbytearray);
            let callerKeyBytes = CLValueParsers.toBytes(callerKey).val
            let operatorKeyBytes = CLValueParsers.toBytes(operatorKey).val
            let mix = Array.from(callerKeyBytes).concat(Array.from(operatorKeyBytes))
            let itemKeyArray = blake.blake2b(Buffer.from(mix), null, 32)
            let itemKey = Buffer.from(itemKeyArray).toString('hex')
            console.log("itemKey ", itemKey)
            console.log("ope ", this.namedKeys.operators)
            const result = await utils.contractDictionaryGetter(
                this.nodeAddress,
                itemKey,
                this.namedKeys.operators
            );
            return result
        } catch (e) {
            console.log(e)
        }


    }
    async transfer(keys, source, recipient, tokenId, paymentAmount, ttl) {
        let identifierMode = await this.identifierMode();
        identifierMode = parseInt(identifierMode.toString());
        let runtimeArgs = {};
        if (identifierMode == 0) {
            runtimeArgs = RuntimeArgs.fromMap({
                token_id: CLValueBuilder.u64(parseInt(tokenId)),
                source_key: createRecipientAddress(source),
                target_key: createRecipientAddress(recipient),
            });
        } else {
            runtimeArgs = RuntimeArgs.fromMap({
                token_hash: CLValueBuilder.string(tokenId),
                source_key: createRecipientAddress(source),
                target_key: createRecipientAddress(recipient),
            });
        }

        return await this.contractClient.contractCall({
            entryPoint: "transfer",
            keys: keys,
            paymentAmount: paymentAmount ? paymentAmount : "1000000000",
            runtimeArgs,
            cb: () => { },
            ttl: ttl ? ttl : DEFAULT_TTL,
        });
    }
};

const BoxFactory = class {
    constructor(contractHash, nodeAddress, chainName) {
        this.contractHash = contractHash.startsWith("hash-")
            ? contractHash.slice(5)
            : contractHash;
        this.nodeAddress = nodeAddress;
        this.chainName = chainName;
        this.contractClient = new CasperContractClient(nodeAddress, chainName);
    }

    static async createInstance(contractHash, nodeAddress, chainName) {
        let factory = new BoxFactory(contractHash, nodeAddress, chainName);
        await factory.init();
        console.log("NameKey: ", factory.namedKeys)
        return factory;
    }

    async init() {
        console.log("intializing", this.nodeAddress, this.contractHash);
        const { contractPackageHash, namedKeys } = await setClient(
            this.nodeAddress,
            this.contractHash,
            ["request_ids"]
        );
        console.log("done");
        this.contractPackageHash = contractPackageHash;
        this.contractClient.chainName = this.chainName;
        this.contractClient.contractHash = this.contractHash;
        this.contractClient.contractPackageHash = this.contractPackageHash;
        this.contractClient.nodeAddress = this.nodeAddress;
        /* @ts-ignore */
        this.namedKeys = namedKeys;
    }

    async contractOwner() {
        return await contractSimpleGetter(this.nodeAddress, this.contractHash, [
            "contract_owner",
        ]);
    }

    async numberOfMintedBox() {
        return await contractSimpleGetter(this.nodeAddress, this.contractHash, [
            "number_of_minted_box",
        ]);
    }

    async transferOwner({
        keys,
        newOwner,
        paymentAmount,
        ttl,
    }) {

        if (!paymentAmount) {
            paymentAmount = paymentAmount ? paymentAmount : "1000000000";
            ttl = ttl ? ttl : DEFAULT_TTL;
        }
        let runtimeArgs = {};
        runtimeArgs = RuntimeArgs.fromMap({
            contract_owner: createRecipientAddress(CLPublicKey.fromHex(newOwner)),
        })
        console.log("sending");
        console.log(paymentAmount)
        console.log(ttl)
        let trial = 5;
        while (true) {
            try {
                let hash = await this.contractClient.contractCall({
                    entryPoint: "transfer_owner",
                    keys: keys,
                    paymentAmount,
                    runtimeArgs,
                    cb: (deployHash) => {
                        console.log("deployHash", deployHash);
                    },
                    ttl,
                });

                return hash;
            } catch (e) {
                trial--
                if (trial == 0) {
                    throw e;
                }
                console.log('waiting 3 seconds')
                await sleep(3000)
            }
        }
    }

    async changeFeeReceiver({
        keys,
        newReceiver,
        paymentAmount,
        ttl,
    }) {

        if (!paymentAmount) {
            paymentAmount = paymentAmount ? paymentAmount : "1000000000";
            ttl = ttl ? ttl : DEFAULT_TTL;
        }
        let runtimeArgs = {};
        runtimeArgs = RuntimeArgs.fromMap({
            fee_receiver: createRecipientAddress(CLPublicKey.fromHex(newReceiver)),
        })
        console.log("sending");
        console.log(paymentAmount)
        console.log(ttl)
        let trial = 5;
        while (true) {
            try {
                let hash = await this.contractClient.contractCall({
                    entryPoint: "change_fee_receiver",
                    keys: keys,
                    paymentAmount,
                    runtimeArgs,
                    cb: (deployHash) => {
                        console.log("deployHash", deployHash);
                    },
                    ttl,
                });

                return hash;
            } catch (e) {
                trial--
                if (trial == 0) {
                    throw e;
                }
                console.log('waiting 3 seconds')
                await sleep(3000)
            }
        }
    }

    async changeMintFee({
        keys,
        newFee,
        paymentAmount,
        ttl,
    }) {

        if (!paymentAmount) {
            paymentAmount = paymentAmount ? paymentAmount : "1000000000";
            ttl = ttl ? ttl : DEFAULT_TTL;
        }
        let runtimeArgs = {};
        runtimeArgs = RuntimeArgs.fromMap({
            wcspr_mint_fee: CLValueBuilder.u256(newFee),
        })
        console.log("sending");
        console.log(paymentAmount)
        console.log(ttl)
        let trial = 5;
        while (true) {
            try {
                let hash = await this.contractClient.contractCall({
                    entryPoint: "change_mint_fee",
                    keys: keys,
                    paymentAmount,
                    runtimeArgs,
                    cb: (deployHash) => {
                        console.log("deployHash", deployHash);
                    },
                    ttl,
                });

                return hash;
            } catch (e) {
                trial--
                if (trial == 0) {
                    throw e;
                }
                console.log('waiting 3 seconds')
                await sleep(3000)
            }
        }
    }


    async changeWcsprContract({
        keys,
        newWcsprContract,
        paymentAmount,
        ttl,
    }) {

        if (!paymentAmount) {
            paymentAmount = paymentAmount ? paymentAmount : "1000000000";
            ttl = ttl ? ttl : DEFAULT_TTL;
        }
        let runtimeArgs = {};

        let newWcsprByte = new CLByteArray(
            Uint8Array.from(Buffer.from(newWcsprContract, "hex"))
        );

        runtimeArgs = RuntimeArgs.fromMap({
            wcspr_contract: createRecipientAddress(newWcsprByte),
        })
        console.log("sending");
        console.log(paymentAmount)
        console.log(ttl)
        let trial = 5;
        while (true) {
            try {
                let hash = await this.contractClient.contractCall({
                    entryPoint: "change_wcspr_contract",
                    keys: keys,
                    paymentAmount,
                    runtimeArgs,
                    cb: (deployHash) => {
                        console.log("deployHash", deployHash);
                    },
                    ttl,
                });

                return hash;
            } catch (e) {
                trial--
                if (trial == 0) {
                    throw e;
                }
                console.log('waiting 3 seconds')
                await sleep(3000)
            }
        }
    }

    async setAddressesWhitelist({
        keys,
        addressesWhitelistArray, // account-hash-... array
        numberOfTickets,
        paymentAmount,
        ttl,
    }) {

        if (!paymentAmount) {
            paymentAmount = paymentAmount ? paymentAmount : "15000000000";
            ttl = ttl ? ttl : DEFAULT_TTL;
        }
        let addressesWhitelistArr = addressesWhitelistArray.map((e) => CLValueBuilder.string(e));
        let arr = []
        for (let i = 0; i < addressesWhitelistArr.length; i++) {
            addressesWhitelistArray[i] = CLPublicKey.fromHex(addressesWhitelistArray[i])
            addressesWhitelistArray[i] = createRecipientAddress(addressesWhitelistArray[i])

            arr.push(addressesWhitelistArray[i])

        }
        console.log("ARR length: ", arr.length)
        console.log("arr: ", arr)
        let runtimeArgs = {};

        runtimeArgs = RuntimeArgs.fromMap({
            "new_addresses_whitelist": CLValueBuilder.list(arr),
            "number_of_tickets": CLValueBuilder.u8(numberOfTickets)
        })
        console.log("sending");
        console.log(paymentAmount)
        console.log(ttl)
        let trial = 5;
        while (true) {
            try {
                let hash = await this.contractClient.contractCall({
                    entryPoint: "set_addresses_whitelist",
                    keys: keys,
                    paymentAmount,
                    runtimeArgs,
                    cb: (deployHash) => {
                        console.log("deployHash", deployHash);
                    },
                    ttl,
                });

                return hash;
            } catch (e) {
                trial--
                if (trial == 0) {
                    throw e;
                }
                console.log('waiting 3 seconds')
                await sleep(3000)
            }
        }
    }

    async updateAddressesWhitelist({
        keys,
        addressesWhitelistArray, // account-hash-... array
        numberOfTickets,
        paymentAmount,
        ttl,
    }) {

        if (!paymentAmount) {
            paymentAmount = paymentAmount ? paymentAmount : "7000000000";
            ttl = ttl ? ttl : DEFAULT_TTL;
        }
        let addressesWhitelistArr = addressesWhitelistArray.map((e) => CLValueBuilder.string(e));
        let arr = []
        for (let i = 0; i < addressesWhitelistArr.length; i++) {
            addressesWhitelistArray[i] = CLPublicKey.fromHex(addressesWhitelistArray[i])
            addressesWhitelistArray[i] = createRecipientAddress(addressesWhitelistArray[i])

            arr.push(addressesWhitelistArray[i])

        }
        console.log("ARR length: ", arr.length)
        console.log("arr: ", arr)
        let runtimeArgs = {};

        runtimeArgs = RuntimeArgs.fromMap({
            "new_addresses_whitelist": CLValueBuilder.list(arr),
            "number_of_tickets": CLValueBuilder.u8(numberOfTickets)
        })
        console.log("sending");
        console.log(paymentAmount)
        console.log(ttl)
        let trial = 5;
        while (true) {
            try {
                let hash = await this.contractClient.contractCall({
                    entryPoint: "update_addresses_whitelist",
                    keys: keys,
                    paymentAmount,
                    runtimeArgs,
                    cb: (deployHash) => {
                        console.log("deployHash", deployHash);
                    },
                    ttl,
                });

                return hash;
            } catch (e) {
                trial--
                if (trial == 0) {
                    throw e;
                }
                console.log('waiting 3 seconds')
                await sleep(3000)
            }
        }
    }


    async mint({
        keys,
        nftContractHash, // contract CEP78
        paymentAmount,
        metadata,
        ttl,
    }) {
        if (!paymentAmount) {
            paymentAmount = paymentAmount ? paymentAmount : "10000000000";
            ttl = ttl ? ttl : "300000";
        }

        // CEP78 NFT CONTRACT
        console.log("nftContractHash: ", nftContractHash)
        nftContractHash = nftContractHash.startsWith("hash-")
            ? nftContractHash.slice(5)
            : nftContractHash;
        console.log("nftContractHash", nftContractHash);
        nftContractHash = new CLByteArray(
            Uint8Array.from(Buffer.from(nftContractHash, "hex"))
        );
        let nftCep78Hash = createRecipientAddress(nftContractHash)
        console.log("nftCep78Hash: ", nftCep78Hash)


        // NFT METADATA
        const token_meta_data = new CLString(JSON.stringify(metadata))

        console.log("token_meta_data", token_meta_data)

        let runtimeArgs = RuntimeArgs.fromMap({
            "nft_contract_package": nftCep78Hash,
            "token_meta_data": token_meta_data,
        })

        console.log("sending");
        let trial = 5;
        while (true) {
            try {
                let hash = await this.contractClient.contractCall({
                    entryPoint: "mint",
                    keys: keys,
                    paymentAmount,
                    runtimeArgs,
                    cb: (deployHash) => {
                        console.log("deployHash", deployHash);
                    },
                    ttl,
                });

                return hash;
            } catch (e) {
                trial--
                if (trial == 0) {
                    throw e;
                }
                console.log('waiting 3 seconds')
                await sleep(3000)
            }
        }
    }
};




module.exports = { EventsCep47Parser, DTOBridgeEvent, DTOWrappedCep78Event, BoxFactory, CEP78, keyAndValueToHex }