const config = require('config')

const CasperHelper = {
    getConfigInfo: () => {
        let network = config.caspernetwork;
        return config[network]
    }
}

module.exports = CasperHelper;
