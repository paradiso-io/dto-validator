const { createLogger, format, transports } = require('winston')
const { combine, printf, timestamp, label } = format
const config = require('config')
const path = require('path')
// Return the last folder name in the path and the calling
// module's filename.
const getLabel = function (callingModule) {
    const parts = callingModule.filename.split(path.sep);
    const ret = path.join(parts[parts.length - 2], parts.pop());
    return ret
};

const lFormat = printf(({ level, message, timestamp, label }) => {
    const length = 22
    label = label.substring(label.length - length)
    while (label.length < length) {
        label = ' ' + label
    }
    label = label.slice(0, label.length - 3)
    return `${timestamp} ${level.toUpperCase().slice(0, 1)}: [${label}] ${message}`
})

function makeLogger(callingModule) {
    const logger = createLogger({
        level: config.get('logs.level'),
        format: combine(
            format.splat(),
            timestamp(),
            label({ label: getLabel(callingModule) }),
            lFormat
        ),
        transports: [new transports.Console({})]
    })
    logger.stream = {
        write: (t) => {
            logger.info(t)
        }
    }
    return logger
}

module.exports = function (callingModule) {
    return makeLogger(callingModule)
}
