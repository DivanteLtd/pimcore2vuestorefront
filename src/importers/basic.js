module.exports = class {
    constructor(entityType, customImporter, config, api, db) {
        this.config = config
        this.db = db
        this.api = api
        this.entityType = entityType
        this.customImporter = customImporter
        this.single = this.single.bind(this)
    }

    /**
     * @returns Promise
     */
    single(descriptor) {
        return new Promise(((resolve, reject) => {
            this.api.get(`object/id/${descriptor.id}`).end((resp) => {
                let result = this.resultTemplate(this.entityType)
                const objectData = resp.body.data
                const locale = this.config.pimcore.locale
                const entityConfig = this.config.pimcore[`${this.entityType}Class`]
                let localizedFields = objectData.elements.find((itm)=> { return itm.name === 'localizedfields'}).value

                result.created_at = new Date(objectData.creationDate*1000)
                result.updated_at = new Date(objectData.modificationDate*1000)
                result.id = descriptor.id
                result.sku = descriptor.id
                console.log(objectData)

                Object.keys(entityConfig.map).map((srcField) => {
                    const dstField = entityConfig.map[srcField]
                    const dstValue = localizedFields.find((lf) => { return lf.name === dstField && lf.language === locale})

                    if(!dstValue)
                    {
                        console.error('Cannot find the value for ', dstField, locale)
                    }
                    result[srcField] = dstValue.type === 'numeric' ? parseFloat(dstValue.value) : dstValue.value
                })

                console.log(result)
                if(this.customImporter)
                {
                    this.customImporter.single(objectData, result).then((resp) => {
                        resolve(result)
                    })
                } else {
                    resolve(result)
                }
            })
        }))
    }

    resultTemplate (entityType) {
        return require(`./templates/${entityType}.json`)
    }
}