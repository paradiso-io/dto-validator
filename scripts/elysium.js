require('dotenv').config()
const { expect } = require("chai");
const { ethers } = require("hardhat");
const config = require('config')
const BN = require('bignumber.js')
const Web3 = require('web3')
const IERC20ABI = require('../contracts/IERC20.json')
const GenericBridgeABI = require('../contracts/GenericBridge.json')
const PrivateKeyProvider = require("truffle-privatekey-provider");

var args = process.argv.slice(2);
console.log(process.argv);