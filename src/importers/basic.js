const attribute = require('../lib/attribute')
const promiseLimit = require('../lib/promise')

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
    single(descriptor, level = 1, parent_id = null) {
        return new Promise(((resolve, reject) => {
            console.debug('** REC. LEVEL = ', level)
            this.api.get(`object/id/${descriptor.id}`).end((resp) => {
                console.log('Processing object: ', descriptor.id)

                if(resp.body && resp.body.data) {
                    const objectData = resp.body.data
                    const subpromises = []
                        
                    if (objectData.childs) {
                        for (let chdDescriptor of objectData.childs) {
                            console.log('- child objects found: ', chdDescriptor.id, descriptor.id)
                            subpromises.push(() => this.single(chdDescriptor, level + 1, descriptor.id))
                        }
                    }
                    new Promise(((subresolve, subreject) => { // TODO: we should extrapolate the code snippet below and make it more general; In other words: to add the same behaviour like we do have here for ALL "objects" related - to download all the connected technologies etc
                        this.api.get('object-list').query({
                            condition: 'o_parentId=\'' + descriptor.id + '\' AND o_type=\'variant\'', // get variants
                        }).end(((resp) => {
                            if(resp.body && resp.body.data)
                                for (let chdDescriptor of resp.body.data) {
                                    console.log('- variant object found: ', chdDescriptor.id, descriptor.id)
                                    subpromises.push(() => this.single(chdDescriptor, level + 1, descriptor.id))
                                }
                            subresolve(subpromises)
                        }).bind(this))
                    }).bind(this)).then((variants) => {
                        console.log('Variants retrieved for ', descriptor.id)

                        let result = this.resultTemplate(this.entityType) // TOOD: objectData.childs should be also taken into consideration
                        const locale = this.config.pimcore.locale
                        const entityConfig = this.config.pimcore[`${this.entityType}Class`]
                        let localizedFields = objectData.elements.find((itm)=> { return itm.name === 'localizedfields'}).value
                        let elements = objectData.elements

                        result.created_at = new Date(objectData.creationDate*1000)
                        result.updated_at = new Date(objectData.modificationDate*1000)
                        result.id = descriptor.id
                        result.sku = descriptor.id

                        Promise.all([ attribute.mapElements(result, elements), attribute.mapElements(result, localizedFields, this.config.pimcore.locale) ]).then((elementResults) => {
                            Object.keys(entityConfig.map).map((srcField) => {
                                const dstField = entityConfig.map[srcField]
                                const dstValue = localizedFields.find((lf) => { return lf.name === dstField && lf.language === locale})

                                if(!dstValue) {
                                    console.error('Cannot find the value for ', dstField, locale)
                                } else {
                                    result[srcField] = dstValue.type === 'numeric' ? parseFloat(dstValue.value) : dstValue.value
                                }
                            })
                            
                            promiseLimit.serial(subpromises).then((childrenResults) => {
                                if(this.customImporter)
                                {
                                    this.customImporter.single(objectData, result, childrenResults, level, parent_id).then((resp) => {
                                        if (childrenResults.length > 0)
                                        {
                                            childrenResults.push(resp)
                                            resolve(childrenResults)
                                        } else resolve(resp)
                                    }).catch((reason) => { console.error(reason) })
                                } else {
                                    if (childrenResults.length > 0)
                                    {                        
                                        childrenResults.push({ dst: result, src: objectData })
                                        resolve(childrenResults)
                                    } else {
                                        resolve({ dst: result, src: objectData })
                                    }
                                    
                                }
                            }).catch((reason) => { console.error(reason) })
                        }).catch((reason) => { console.error(reason)})
                    }).catch((reason) => { console.error(reason) })
                } else {
                    console.error('No Data for ', descriptor.id)
                }
            })
        }))
    }


    resultTemplate (entityType) { // TODO: add /templates/general.json for all the other entities - like featured product links etc to map all the linked objects and so on
        return Object.assign({}, require(`./templates/${entityType}.json`))
    }
}