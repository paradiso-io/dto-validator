const express = require('express')
const config = require('config')
const bodyParser = require('body-parser')
const app = express()
const cors = require('cors')
const compression = require('compression')
const logger = require('./helpers/logger')

const server = require('http').Server(app)

app.use(compression())
app.use(cors())
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())
// api
app.use(require('./api'))

// start server
server.listen(config.get('server.port'), config.get('server.host'), function () {
    const host = server.address().address
    const port = server.address().port
    logger.info('Server start at http://%s:%s', host, port)
})

module.exports = app
