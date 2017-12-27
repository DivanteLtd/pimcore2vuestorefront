const config = require('../config.json')
const PimcoreApiClient = require('./lib/pimcore-api')
const api = new PimcoreApiClient(config.pimcore)

if (require.main.filename === __filename) {
    api.get('classes').end((resp) => {
        console.log(resp.body)
    })
}    