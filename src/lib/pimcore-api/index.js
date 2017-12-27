'use strict'
const unirest = require('unirest')

class PimcoreApiClient {

    /**
     * Setup Pimcore Api Client
     * @param {object} config configuration with "apiKey" and "url" keys for Pimcore API endpoint
     */
    constructor(config) {
        this.config = config

        if (!config.apiKey || !config.url)
            throw Error('apiKey and url are required config keys for Pimcore Api Client')
    
        this.baseUrl = `${config.url}webservice/rest/`
        this.apiKey = config.apiKey
        this.client = unirest
    }

    _setupRequest(unirest) {
        return unirest.headers({'Accept': 'application/json', 'Content-Type': 'application/json'})        
    }
    _setupUrl(endpointName) {
        return this.baseUrl + endpointName + '?apikey=' + this.apiKey
    }
    post(endpointName) {
        return this._setupRequest(this.client.post(this._setupUrl(endpointName)))
    }

    get(endpointName) {
        return this._setupRequest(this.client.get(this._setupUrl(endpointName)))
    }

    put(endpointName) {
        return this._setupRequest(client.put(this._setupUrl(endpointName)))
    }

    delete(endpointName) {
        return this._setupRequest(client.delete(this._setupUrl(endpointName)))
    }
    
}
module.exports = PimcoreApiClient