module.exports = class {
    construct(config, api, db) {
        this.config = config
        this.db = db
        this.api = api
    }

    /**
     * @returns Promise
     */
    single(objectData, result) {
        return new Promise((resolve, reject) => {
            resolve(result)
        })
    }
}