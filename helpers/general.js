const config = require('config')
const logger = require('./logger')

/* A helper function that is used to help with the code. */
let GeneralHelper = {
    getEndPoint: () => {
      const config = require('config')
      if (config.caspernetwork == "mainnet") {
        return "https://bridge-mainnet.dotoracle.network"
      }
      return "https://api.dotoracle.network"
    },
    randomNumber: (min, max) => {
      return Math.floor(Math.random() * (max - min + 1)) + min
    },
    randomItemInArray: (array) => {
      if (!Array.isArray(array) || array.length === 0) {
        return null
      }
      if (array.length === 1) {
        return  array[0]
      }
      return array[GeneralHelper.randomNumber(0, array.length - 1)]
    },
    sleep: async (time) => new Promise((resolve) => setTimeout(resolve, time)),
    now: () => {
      return Math.floor(Date.now() / 1000)
    },
    newExpiryTime: (howManyMin = 5) => {
      return GeneralHelper.now() + howManyMin * 60
    },
    capitalize: (str) => {
      return str.charAt(0).toUpperCase() + str.slice(1)
    },
    tryCallWithTrial: async (func, trial = 10, waitTime = 2000) => {
      while(trial > 0) {
        try {
          let ret = await func()
          return ret
        } catch (e) {
          logger.warn(e.toString())
          await GeneralHelper.sleep(waitTime)
        }
        trial--
      }
      return undefined
    },
    tryCallWithTrialWithCallback: async (func, trial = 10, waitTime = 2000, callback) => {
      let ret = undefined
      while(trial > 0) {
        try {
          ret = await func()
          break
        } catch (e) {
          logger.warn(e.toString())
          await GeneralHelper.sleep(waitTime)
        }
        trial--
      }
      return await callback(ret)
    }
  }
  
  module.exports = GeneralHelper