'use strict'

// Libp2p Core
const Libp2p = require('libp2p')
// Transports
const TCP = require('libp2p-tcp')
const Websockets = require('libp2p-websockets')
// const WebRTCStar = require('libp2p-webrtc-star')
// const wrtc = require('wrtc')
// Stream Muxer
const Mplex = require('libp2p-mplex')
// Connection Encryption
const { NOISE } = require('libp2p-noise')
// Chat over Pubsub
const PubsubChat = require('../chat/chat')
// Peer Discovery
const Bootstrap = require('libp2p-bootstrap')
const MDNS = require('libp2p-mdns')
//const KadDHT = require('libp2p-kad-dht')
// Gossipsub
const Gossipsub = require('libp2p-gossipsub')
// const db = require('../models')

const config = require('config')
const queueHelper = require('../helpers/queue')
const generalHelper = require('../helpers/general')
const db = require('../models')
const logger = require("../helpers/logger");
const { DeployUtil } = require("casper-js-sdk");

//console.log(config.get(rabbitmq.hostname))
;(async () => {
  // Create the Node
  const libp2p = await Libp2p.create({
    addresses: {
      listen: [
        '/ip4/0.0.0.0/tcp/222'
      
      ]
    },
    modules: {
      transport: [ TCP, Websockets ],
      streamMuxer: [ Mplex ],
      connEncryption: [ NOISE ],
      peerDiscovery: [ Bootstrap ],
      // dht: KadDHT,
      pubsub: Gossipsub
    },
    config: {
      transport : {
        // [WebRTCStar.prototype[Symbol.toStringTag]]: {
        //   wrtc
        // }
      },
      peerDiscovery: {
        bootstrap: {
          list: [ '/ip4/139.99.9.174/tcp/63785/ipfs/QmWjz6xb8v9K4KnYEwP5Yk75k5mMBCehzWFLCvvQpYxF3d' ]
        }
      },
      // dht: {
      //   enabled: true,
      //   randomWalk: {
      //     enabled: true
      //   }
      // }
    }
  })

  // Listen on libp2p for `peer:connect` and log the provided connection.remotePeer.toB58String() peer id string.
  libp2p.connectionManager.on('peer:connect', (connection) => {
    console.info(`Connected to ${connection.remotePeer.toB58String()}!`)
  })

  // Start libp2p
  await libp2p.start()
  console.log('ID  node PRODUCER : ' , libp2p.peerId.toB58String())
  //console.log(libp2p.peerId)



// const config = require('config')
// const queueHelper = require('../helpers/queue')
// const generalHelper = require('../helpers/general')
// const db = require('../models')
// const logger = require("../helpers/logger");
// const { DeployUtil } = require("casper-js-sdk");
  

//   const config = require('config')
//   const queueHelper = require('../helpers/queue')
//   const generalHelper = require('../helpers/general')
//   const db = require('./models')
  
 //Create our PubsubChat client 
 const pubsubChat = new PubsubChat(libp2p, PubsubChat.TOPIC, ({ from, message }) => {
    let fromMe = from === libp2p.peerId.toB58String()
    let user = fromMe ? 'Me' : from.substring(0, 6)
    if (pubsubChat.userHandles.has(from)) {
    user = pubsubChat.userHandles.get(from)
    }
    console.info(`${fromMe ? PubsubChat.CLEARLINE : ''}${user}(${new Date(message.created).toLocaleTimeString()}): ${message.data}`)
})



  while(true) {
         // let tx = await db.RequestToCasper.find({isProcessed: false}).sort({ timestamp: 1 }).limit(1)
          let tx = await db.RequestToCasper.findOne({isProcessed: false})
          //console.log(tx)
          
          //if (tx && tx.length > 0) {
          //  tx = tx[0]
            if (tx) {
                    await queueHelper.newQueue(`abc`,
                        {
                            requestHash: tx.requestHash,
                            index: tx.index,
                            deployHash: tx.deployHash,
                            deployHashToSign: tx.deployHashToSign,
                            toWallet: tx.toWallet,
                            fromChainId: tx.fromChainId,
                            toChainId: tx.toChainId,
                            originChainId: tx.originChainId,
                            originToken: tx.originToken.toLowerCase(),
                            destinationContractHash: tx.destinationContractHash,
                            timestamp: tx.timestamp,
                            deployJsonString: tx.deployJsonString,
                            amount: tx.amount,
                            mintid: tx.mintid
                        }
                    )

                    let success = null

                    //Create our PubsubChat client 
                    const pubsubChat = new PubsubChat(libp2p, PubsubChat.TOPIC, ({ from, message }) => {
                        let fromMe = from === libp2p.peerId.toB58String()
                        let user = fromMe ? 'Me' : from.substring(0, 6)
                        if (pubsubChat.userHandles.has(from)) {
                        user = pubsubChat.userHandles.get(from)
                        }
                        console.info(`${fromMe ? PubsubChat.CLEARLINE : ''}${user}(${new Date(message.created).toLocaleTimeString()}): ${message.data}`)
                        
                        try {
                            await pubsubChat.send(JSON.stringify(tx))
                           // console.log("send sucessed")
                        } catch (err) {
                            console.error('Could not publish chat', err)
                        }
                        
                        success = JSON.parse(message.data)
                    })


                    // try {
                    //     await pubsubChat.send(JSON.stringify(tx))
                    //    // console.log("send sucessed")
                    // } catch (err) {
                    //     console.error('Could not publish chat', err)
                    // }

                    // const pubsubChat = new PubsubChat(libp2p, PubsubChat.TOPIC, ({ from, message }) => {
                    //     let fromMe = from === libp2p.peerId.toB58String()
                    //     let user = fromMe ? 'Me' : from.substring(0, 6)
                    //     if (pubsubChat.userHandles.has(from)) {
                    //     user = pubsubChat.userHandles.get(from)
                    //     }
                    //     console.info(`${fromMe ? PubsubChat.CLEARLINE : ''}${user}(${new Date(message.created).toLocaleTimeString()}): ${message.data}`)
                    //     success = JSON.parse(message.data)
                    // })
                    
                    if (success != null) {
                        tx.isProcessed = true
                    }
                    
                    
                    await tx.save()
                    //console.log('sleep 60 seconds before continue')
                    await generalHelper.sleep(60000)
            }
        
  



   
               

                // Set up our input handler
                //process.stdin.on('data', async (message) => {
                    //message = tx
                    //console.log(message)
                    // Remove trailing newline
                    //message = message.slice(0, -1)
                    
                    // TODO: use pubsubChat.checkCommand(message) to exit early if it returns true

                    // Publish the message
                    
  //})
               // }
}
})()