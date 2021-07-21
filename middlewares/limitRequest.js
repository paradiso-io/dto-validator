const redis = require('../helpers/redis')
module.exports = function (options) {
    return async function (req, res, next) {
        const ffHeaderValue = req.header('x-forwarded-for') ? req.header('x-forwarded-for').split(',')[0] : ''
        const ip = ffHeaderValue || req.connection.remoteAddress

        if (ip && ip !== '::1' && ip !== '127.0.0.1') {
            let cache1min = await redis.get(`total-request-1min-${ip}`)

            let number = 0
            let now = Math.floor(Date.now() / 1000)
            if (cache1min) {
                cache1min = JSON.parse(cache1min)
                let startTime = cache1min.startTime
                if (now - startTime <= 60) {
                    number = cache1min.number
                }
            }
            number += 1
            let newCache = JSON.stringify({startTime: now, number: number})
            await redis.set(`total-request-1min-${ip}`, newCache, 60)
            if (number > 600) {
                return res.status(403).json({ errors: 'Limit 600 requests/minute' })
            }
        }
        return next()
    }
}
