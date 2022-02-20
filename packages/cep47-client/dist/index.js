var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CEP47Client = exports.CEP47EventParser = exports.CEP47Events = void 0;
var casper_js_sdk_1 = require("casper-js-sdk");
var bytes_1 = require("@ethersproject/bytes");
var blakejs_1 = __importDefault(require("blakejs"));
var Contract = casper_js_sdk_1.Contracts.Contract, toCLMap = casper_js_sdk_1.Contracts.toCLMap, fromCLMap = casper_js_sdk_1.Contracts.fromCLMap;
;
var CEP47Events;
(function (CEP47Events) {
    CEP47Events["MintOne"] = "cep47_mint_one";
    CEP47Events["TransferToken"] = "cep47_transfer_token";
    CEP47Events["BurnOne"] = "cep47_burn_one";
    CEP47Events["MetadataUpdate"] = "cep47_metadata_update";
    CEP47Events["ApproveToken"] = "cep47_approve_token";
})(CEP47Events = exports.CEP47Events || (exports.CEP47Events = {}));
var CEP47EventParser = function (_a, value) {
    var contractPackageHash = _a.contractPackageHash, eventNames = _a.eventNames;
    if (value.body.DeployProcessed.execution_result.Success) {
        var transforms = value.body.DeployProcessed.execution_result.Success.effect.transforms;
        var cep47Events = transforms.reduce(function (acc, val) {
            if (val.transform.hasOwnProperty("WriteCLValue") &&
                typeof val.transform.WriteCLValue.parsed === "object" &&
                val.transform.WriteCLValue.parsed !== null) {
                var maybeCLValue = casper_js_sdk_1.CLValueParsers.fromJSON(val.transform.WriteCLValue);
                var clValue = maybeCLValue.unwrap();
                if (clValue && clValue instanceof casper_js_sdk_1.CLMap) {
                    var hash = clValue.get(casper_js_sdk_1.CLValueBuilder.string("contract_package_hash"));
                    var event_1 = clValue.get(casper_js_sdk_1.CLValueBuilder.string("event_type"));
                    if (hash &&
                        hash.value() === contractPackageHash.slice(5).toLowerCase() &&
                        event_1 &&
                        eventNames.includes(event_1.value())) {
                        acc = __spreadArray(__spreadArray([], acc, true), [{ name: event_1.value(), clValue: clValue }], false);
                    }
                }
            }
            return acc;
        }, []);
        return { error: null, success: !!cep47Events.length, data: cep47Events };
    }
    return null;
};
exports.CEP47EventParser = CEP47EventParser;
var keyAndValueToHex = function (key, value) {
    var aBytes = casper_js_sdk_1.CLValueParsers.toBytes(key).unwrap();
    var bBytes = casper_js_sdk_1.CLValueParsers.toBytes(value).unwrap();
    var blaked = blakejs_1.default.blake2b((0, bytes_1.concat)([aBytes, bBytes]), undefined, 32);
    var hex = Buffer.from(blaked).toString('hex');
    return hex;
};
var CEP47Client = (function () {
    function CEP47Client(nodeAddress, networkName) {
        this.nodeAddress = nodeAddress;
        this.networkName = networkName;
        this.casperClient = new casper_js_sdk_1.CasperClient(nodeAddress);
        this.contractClient = new Contract(this.casperClient);
    }
    CEP47Client.prototype.install = function (wasm, args, paymentAmount, deploySender, keys) {
        var runtimeArgs = casper_js_sdk_1.RuntimeArgs.fromMap({
            name: casper_js_sdk_1.CLValueBuilder.string(args.name),
            contract_name: casper_js_sdk_1.CLValueBuilder.string(args.contractName),
            symbol: casper_js_sdk_1.CLValueBuilder.string(args.symbol),
            meta: toCLMap(args.meta),
        });
        return this.contractClient.install(wasm, runtimeArgs, paymentAmount, deploySender, this.networkName, keys || []);
    };
    CEP47Client.prototype.setContractHash = function (contractHash, contractPackageHash) {
        this.contractClient.setContractHash(contractHash, contractPackageHash);
    };
    CEP47Client.prototype.name = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2, this.contractClient.queryContractData(['name'])];
            });
        });
    };
    CEP47Client.prototype.symbol = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2, this.contractClient.queryContractData(['symbol'])];
            });
        });
    };
    CEP47Client.prototype.meta = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2, this.contractClient.queryContractData(['meta'])];
            });
        });
    };
    CEP47Client.prototype.totalSupply = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2, this.contractClient.queryContractData(['total_supply'])];
            });
        });
    };
    CEP47Client.prototype.balanceOf = function (account) {
        return __awaiter(this, void 0, void 0, function () {
            var result, maybeValue;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4, this.contractClient
                            .queryContractDictionary('balances', account.toAccountHashStr().slice(13))];
                    case 1:
                        result = _a.sent();
                        maybeValue = result.value().unwrap();
                        return [2, maybeValue.value().toString()];
                }
            });
        });
    };
    CEP47Client.prototype.getOwnerOf = function (tokenId) {
        return __awaiter(this, void 0, void 0, function () {
            var result, maybeValue;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4, this.contractClient
                            .queryContractDictionary('owners', tokenId)];
                    case 1:
                        result = _a.sent();
                        maybeValue = result.value().unwrap();
                        return [2, "account-hash-".concat(Buffer.from(maybeValue.value().value()).toString("hex"))];
                }
            });
        });
    };
    CEP47Client.prototype.getTokenMeta = function (tokenId) {
        return __awaiter(this, void 0, void 0, function () {
            var result, maybeValue;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4, this.contractClient
                            .queryContractDictionary('metadata', tokenId)];
                    case 1:
                        result = _a.sent();
                        maybeValue = result.value().unwrap().value();
                        return [2, fromCLMap(maybeValue)];
                }
            });
        });
    };
    CEP47Client.prototype.getTokenByIndex = function (owner, index) {
        return __awaiter(this, void 0, void 0, function () {
            var hex, result, maybeValue;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        hex = keyAndValueToHex(casper_js_sdk_1.CLValueBuilder.key(owner), casper_js_sdk_1.CLValueBuilder.u256(index));
                        return [4, this.contractClient.queryContractDictionary('owned_tokens_by_index', hex)];
                    case 1:
                        result = _a.sent();
                        maybeValue = result.value().unwrap();
                        return [2, maybeValue.value().toString()];
                }
            });
        });
    };
    CEP47Client.prototype.getIndexByToken = function (owner, tokenId) {
        return __awaiter(this, void 0, void 0, function () {
            var hex, result, maybeValue;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        hex = keyAndValueToHex(casper_js_sdk_1.CLValueBuilder.key(owner), casper_js_sdk_1.CLValueBuilder.u256(tokenId));
                        return [4, this.contractClient.queryContractDictionary('owned_indexes_by_token', hex)];
                    case 1:
                        result = _a.sent();
                        maybeValue = result.value().unwrap();
                        return [2, maybeValue.value().toString()];
                }
            });
        });
    };
    CEP47Client.prototype.getAllowance = function (owner, tokenId) {
        return __awaiter(this, void 0, void 0, function () {
            var hex, result, maybeValue;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        hex = keyAndValueToHex(casper_js_sdk_1.CLValueBuilder.key(owner), casper_js_sdk_1.CLValueBuilder.string(tokenId));
                        return [4, this.contractClient.queryContractDictionary('allowances', hex)];
                    case 1:
                        result = _a.sent();
                        maybeValue = result.value().unwrap();
                        return [2, "account-hash-".concat(Buffer.from(maybeValue.value().value()).toString("hex"))];
                }
            });
        });
    };
    CEP47Client.prototype.approve = function (spender, ids, paymentAmount, deploySender, keys) {
        return __awaiter(this, void 0, void 0, function () {
            var runtimeArgs;
            return __generator(this, function (_a) {
                runtimeArgs = casper_js_sdk_1.RuntimeArgs.fromMap({
                    spender: casper_js_sdk_1.CLValueBuilder.key(spender),
                    token_ids: casper_js_sdk_1.CLValueBuilder.list(ids.map(function (id) { return casper_js_sdk_1.CLValueBuilder.u256(id); }))
                });
                return [2, this.contractClient.callEntrypoint('approve', runtimeArgs, deploySender, this.networkName, paymentAmount, keys)];
            });
        });
    };
    CEP47Client.prototype.mint = function (recipient, ids, metas, paymentAmount, deploySender, keys) {
        return __awaiter(this, void 0, void 0, function () {
            var runtimeArgs;
            return __generator(this, function (_a) {
                runtimeArgs = casper_js_sdk_1.RuntimeArgs.fromMap({
                    recipient: casper_js_sdk_1.CLValueBuilder.key(recipient),
                    token_ids: casper_js_sdk_1.CLValueBuilder.list(ids.map(function (id) { return casper_js_sdk_1.CLValueBuilder.u256(id); })),
                    token_metas: casper_js_sdk_1.CLValueBuilder.list(metas.map(function (meta) { return toCLMap(meta); }))
                });
                return [2, this.contractClient.callEntrypoint('mint', runtimeArgs, deploySender, this.networkName, paymentAmount, keys)];
            });
        });
    };
    CEP47Client.prototype.mintCopies = function (recipient, ids, meta, count, paymentAmount, deploySender, keys) {
        return __awaiter(this, void 0, void 0, function () {
            var runtimeArgs;
            return __generator(this, function (_a) {
                runtimeArgs = casper_js_sdk_1.RuntimeArgs.fromMap({
                    recipient: casper_js_sdk_1.CLValueBuilder.key(recipient),
                    token_ids: casper_js_sdk_1.CLValueBuilder.list(ids.map(function (id) { return casper_js_sdk_1.CLValueBuilder.u256(id); })),
                    token_meta: toCLMap(meta),
                    count: casper_js_sdk_1.CLValueBuilder.u32(count)
                });
                return [2, this.contractClient.callEntrypoint('mint_copies', runtimeArgs, deploySender, this.networkName, paymentAmount, keys)];
            });
        });
    };
    CEP47Client.prototype.burn = function (owner, ids, paymentAmount, deploySender, keys) {
        return __awaiter(this, void 0, void 0, function () {
            var runtimeArgs;
            return __generator(this, function (_a) {
                runtimeArgs = casper_js_sdk_1.RuntimeArgs.fromMap({
                    owner: casper_js_sdk_1.CLValueBuilder.key(owner),
                    token_ids: casper_js_sdk_1.CLValueBuilder.list(ids.map(function (id) { return casper_js_sdk_1.CLValueBuilder.u256(id); })),
                });
                return [2, this.contractClient.callEntrypoint('burn', runtimeArgs, deploySender, this.networkName, paymentAmount, keys)];
            });
        });
    };
    CEP47Client.prototype.transferFrom = function (recipient, owner, ids, paymentAmount, deploySender, keys) {
        return __awaiter(this, void 0, void 0, function () {
            var runtimeArgs;
            return __generator(this, function (_a) {
                runtimeArgs = casper_js_sdk_1.RuntimeArgs.fromMap({
                    recipient: casper_js_sdk_1.CLValueBuilder.key(recipient),
                    sender: casper_js_sdk_1.CLValueBuilder.key(owner),
                    token_ids: casper_js_sdk_1.CLValueBuilder.list(ids.map(function (id) { return casper_js_sdk_1.CLValueBuilder.u256(id); })),
                });
                return [2, this.contractClient.callEntrypoint('transfer_from', runtimeArgs, deploySender, this.networkName, paymentAmount, keys)];
            });
        });
    };
    CEP47Client.prototype.transfer = function (recipient, ids, paymentAmount, deploySender, keys) {
        return __awaiter(this, void 0, void 0, function () {
            var runtimeArgs;
            return __generator(this, function (_a) {
                runtimeArgs = casper_js_sdk_1.RuntimeArgs.fromMap({
                    recipient: casper_js_sdk_1.CLValueBuilder.key(recipient),
                    token_ids: casper_js_sdk_1.CLValueBuilder.list(ids.map(function (id) { return casper_js_sdk_1.CLValueBuilder.u256(id); })),
                });
                return [2, this.contractClient.callEntrypoint('transfer', runtimeArgs, deploySender, this.networkName, paymentAmount, keys)];
            });
        });
    };
    CEP47Client.prototype.updateTokenMeta = function (id, meta, paymentAmount, deploySender, keys) {
        return __awaiter(this, void 0, void 0, function () {
            var runtimeArgs;
            return __generator(this, function (_a) {
                runtimeArgs = casper_js_sdk_1.RuntimeArgs.fromMap({
                    token_id: casper_js_sdk_1.CLValueBuilder.u256(id),
                    token_meta: toCLMap(meta),
                });
                return [2, this.contractClient.callEntrypoint('update_token_meta', runtimeArgs, deploySender, this.networkName, paymentAmount, keys)];
            });
        });
    };
    return CEP47Client;
}());
exports.CEP47Client = CEP47Client;
//# sourceMappingURL=index.js.map