"use strict";

// Libp2p Core
const Libp2p = require("libp2p");
// Transports
const TCP = require("libp2p-tcp");
const Websockets = require("libp2p-websockets");
// const WebRTCStar = require('libp2p-webrtc-star')
// const wrtc = require('wrtc')
// Stream Muxer
const Mplex = require("libp2p-mplex");
// Connection Encryption
const { NOISE } = require("libp2p-noise");
// Chat over Pubsub
const PubsubChat = require("../chat/chat");
// Peer Discovery
const Bootstrap = require("libp2p-bootstrap");
const MDNS = require("libp2p-mdns");
//const KadDHT = require('libp2p-kad-dht')
// Gossipsub
const Gossipsub = require("libp2p-gossipsub");
// const db = require('../models')

const config = require("config");
const generalHelper = require("../helpers/general");
const db = require("../models");
const logger = require("../helpers/logger");
const { DeployUtil } = require("casper-js-sdk");
const { sleep } = require("../helpers/general");
(
  async () => {
    // Create the Node
    const libp2p = await Libp2p.create({
      addresses: {
        listen: [
          `/ip4/0.0.0.0/tcp/${config.producerport[config.caspernetwork]}`,
        ],
      },
      modules: {
        transport: [TCP, Websockets],
        streamMuxer: [Mplex],
        connEncryption: [NOISE],
        peerDiscovery: [Bootstrap],
        // dht: KadDHT,
        pubsub: Gossipsub,
      },
      config: {
        transport: {
          // [WebRTCStar.prototype[Symbol.toStringTag]]: {
          //   wrtc
          // }
        },
        peerDiscovery: {
          bootstrap: {
            list: [config.bootstrap[config.caspernetwork]],
          },
        },
      },
    });

    // Listen on libp2p for `peer:connect` and log the provided connection.remotePeer.toB58String() peer id string.
    libp2p.connectionManager.on("peer:connect", (connection) => {
      logger.info(`Connected to ${connection.remotePeer.toB58String()}!`);
    });

    // Start libp2p
    await libp2p.start();
    logger.info("ID  node PRODUCER : %s", libp2p.peerId.toB58String());

    //Create our PubsubChat client
    const pubsubChat = new PubsubChat(
      libp2p,
      PubsubChat.TOPIC,
      async ({ from, message }) => {
        let fromMe = from === libp2p.peerId.toB58String();
        let user = fromMe ? "Me" : from.substring(0, 6);
        if (pubsubChat.userHandles.has(from)) {
          user = pubsubChat.userHandles.get(from);
        }
        logger.info(
          `${fromMe ? PubsubChat.CLEARLINE : ""}${user}(${new Date(
            message.created
          ).toLocaleTimeString()}): ${message.data}`
        );
      }
    );
    while (true) {
      let tx = await db.RequestToCasper.findOne({ isProcessed: false });
      if (tx) {
        // Create our PubsubChat client
        const pubsubChat = new PubsubChat(
          libp2p,
          PubsubChat.TOPIC,
          async ({ from, message }) => {
            let fromMe = from === libp2p.peerId.toB58String();
            let user = fromMe ? "Me" : from.substring(0, 6);
            if (pubsubChat.userHandles.has(from)) {
              user = pubsubChat.userHandles.get(from);
            }
            logger.info(
              `${fromMe ? PubsubChat.CLEARLINE : ""}${user}(${new Date(
                message.created
              ).toLocaleTimeString()}): ${message.data}`
            );
          }
        );

        // let success = null

        try {
          await pubsubChat.send(JSON.stringify(tx));
        } catch (err) {
          logger.error("Could not publish chat = %s", err);
        }

        //  if (success != null) {
        tx.isProcessed = true;
        // }

        await tx.save();
        await sleep(60000);
      }
    }
  }
)();
