module.exports = class {
    constructor(config, api, db) {
        this.config = config
        this.db = db
        this.api = api
    }

    /**
     * @returns Promise
     */
    single(pimcoreObjectData, convertedObject, childObjects) {
        return new Promise((resolve, reject) => {
            resolve({ src: pimcoreObjectData, dst: convertedObject })
        })
    }
}