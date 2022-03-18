'use strict'

// Libp2p Core
const Libp2p = require('libp2p')
// Transports
const TCP = require('libp2p-tcp')
const Websockets = require('libp2p-websockets')
//const WebrtcStar = require('libp2p-webrtc-star')
// wrtc for node to supplement WebrtcStar
// const wrtc = require('wrtc')
// Signaling Server for webrtc
//const SignalingServer = require('libp2p-webrtc-star/src/sig-server')

// Stream Multiplexers
const Mplex = require('libp2p-mplex')
// Encryption
const { NOISE } = require('libp2p-noise')
// Discovery
const MDNS = require('libp2p-mdns')
const Bootstrap = require('libp2p-bootstrap')
// DHT
//const KademliaDHT = require('libp2p-kad-dht')
// PubSub
const Gossipsub = require('libp2p-gossipsub')

const PeerId = require('peer-id')
const idJSON = require('../config/id.json')
const PubsubChat = require('../chat/chat')

// Chat protocol
const ChatProtocol = require('../chat/chat-protocol')
const bootstrapMultiaddrs = [
    '/ip4/127.0.0.1/tcp/99/ipfs/QmbAGRDkbbmKva5tV6vKrWjAFrPHbc5zeaMHuwjReqxp6d',
    '/ip4/127.0.0.1/tcp/100/ipfs/QmZUGghqGVssYP45GYnQu17ArYoGrhf5yvPDe4eTFQVDaD'
]

;(async () => {
  const peerId = await PeerId.createFromJSON(idJSON)
  //console.log(peerId)

  // Wildcard listen on TCP and Websocket
  const addrs = [
    '/ip4/0.0.0.0/tcp/63785'
    //'/ip4/0.0.0.0/tcp/88'
    //'/ip4/0.0.0.0/tcp/8000',
    //'/ip4/0.0.0.0/tcp/63777',
    //'/ip4/0.0.0.0/tcp/63778/ws',
    //'/ip4/45.76.112.224/tcp/8000/ws'
  ]
 

//   const signalingServer = await SignalingServer.start({
//     port: 15555
//   })
  //const ssAddr = `/ip4/${signalingServer.info.host}/tcp/${signalingServer.info.port}/ws/p2p-webrtc-star`
  //console.info(`Signaling server running at ${ssAddr}`)
  //addrs.push(`${ssAddr}/p2p/${peerId.toB58String()}`)

  // Create the node
  const libp2p = await createBootstrapNode(peerId, addrs)

  // Add chat handler
   libp2p.handle(ChatProtocol.PROTOCOL, ChatProtocol.handler)

//   // Set up our input handler
  process.stdin.on('data', (message) => {
    // remove the newline
    message = message.slice(0, -1)
    // Iterate over all peers, and send messages to peers we are connected to
    libp2p.peerStore.peers.forEach(async (peerData) => {
      // If they dont support the chat protocol, ignore
      if (!peerData.protocols.includes(ChatProtocol.PROTOCOL)) return

      // If we're not connected, ignore
      const connection = libp2p.connectionManager.get(peerData.id)
      if (!connection) return

      try {
        const { stream } = await connection.newStream([ChatProtocol.PROTOCOL])
        await ChatProtocol.send(message, stream)
      } catch (err) {
        console.error('Could not negotiate chat protocol stream with peer', err)
      }
    })
  })

  // Start the node
  await libp2p.start()
  console.log('Node started with addresses:')
  libp2p.transportManager.getAddrs().forEach(ma => console.log(ma.toString()))
  console.log('ID bootstrap node: ' , libp2p.peerId.toB58String())
  console.log('\nNode supports protocols:')
  libp2p.upgrader.protocols.forEach((_, p) => console.log(p))

  libp2p.connectionManager.on('peer:connect', (connection) => {
    console.log(`Connected to ${connection.remotePeer.toB58String()}!`)
  })

  // Create the Pubsub based chat extension
  const pubsubChat = new PubsubChat(libp2p, PubsubChat.TOPIC, ({ from, message }) => {
    let fromMe = from === libp2p.peerId.toB58String()
    let user = from.substring(0, 6)
    if (pubsubChat.userHandles.has(from)) {
      user = pubsubChat.userHandles.get(from)
    }
    console.info(`${fromMe ? PubsubChat.CLEARLINE : ''}${user}(${new Date(message.created).toLocaleTimeString()}): ${message.data}`)
    
  })

  // Set up our input handler
  process.stdin.on('data', async (message) => {
    // Remove trailing newline
    message = message.slice(0, -1)
    // If there was a command, exit early
    if (pubsubChat.checkCommand(message)) return

    try {
      // Publish the message
      await pubsubChat.send(message)
      console.log('send data from bootstrap')
    } catch (err) {
      console.error('Could not publish chat', err)
    }
  })
})()





const createBootstrapNode = (peerId, listenAddrs) => {
  return Libp2p.create({
    peerId,
    addresses: {
      listen: listenAddrs
    },
    modules: {
      transport: [ TCP, Websockets ],
      streamMuxer: [ Mplex ],
      connEncryption: [ NOISE ],
      peerDiscovery: [  Bootstrap ],
      //dht: KademliaDHT,
      pubsub: Gossipsub
    },
    config: {
      transport : {
        // [WebrtcStar.prototype[Symbol.toStringTag]]: {
        //   // wrtc
        // }
      },
      peerDiscovery: {
        [Bootstrap.tag]: {
            list: bootstrapMultiaddrs,
              interval: 5000, // default is 10 ms,
              enabled: true
        }
    },
      relay: {
        enabled: true,
        hop: {
          enabled: true,
          active: false
        }
      },
    //   dht: {
    //     enabled: true,
    //     randomWalk: {
    //       enabled: true
    //     }
    //   }
    }
  })
}
