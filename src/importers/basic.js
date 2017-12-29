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
                console.log('Processing object: ', descriptor.id)
                const objectData = resp.body.data
                const subpromises = []

                if (objectData.childs) {
                    for (let chdDescriptor of objectData.childs) {
                        console.log('- child objects found: ', chdDescriptor.id, descriptor.id)
                        subpromises.push(this.single(chdDescriptor))
                    }
                }
                new Promise(((subresolve, subreject) => {
                    this.api.get('object-list').query({
                        condition: 'o_parentId=\'' + descriptor.id + '\' AND o_type=\'variant\'', // get variants
                    }).end(((resp) => {
                        for (let chdDescriptor of resp.body.data) {
                            console.log('- variant object found: ', chdDescriptor.id, descriptor.id)
                            subpromises.push(this.single(chdDescriptor))
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

                    this.mapElements(result, elements)
                    this.mapElements(result, localizedFields, this.config.pimcore.locale)

                    Object.keys(entityConfig.map).map((srcField) => {
                        const dstField = entityConfig.map[srcField]
                        const dstValue = localizedFields.find((lf) => { return lf.name === dstField && lf.language === locale})

                        if(!dstValue)
                        {
                            console.error('Cannot find the value for ', dstField, locale)
                        }
                        result[srcField] = dstValue.type === 'numeric' ? parseFloat(dstValue.value) : dstValue.value
                    })
                    
                    Promise.all(subpromises).then((childrenResults) => {
                        if(this.customImporter)
                        {
                            this.customImporter.single(objectData, result, childrenResults).then((resp) => {
                                if (childrenResults.length > 0)
                                {
                                    childrenResults.push(resp)
                                    resolve(childrenResults)
                                } else resolve(resp)
                            })
                        } else {
                            if (childrenResults.length > 0)
                            {                        
                                childrenResults.push({ dst: result, src: objectData })
                                resolve(childrenResults)
                            } else {
                                resolve({ dst: result, src: objectData })
                            }
                            
                        }
                    })
                })
            })
        }))
    }

    mapElements(result, elements, locale = null) {
        for(let attr of elements) 
        {
            if(['multiselect', 'input', 'wysiwyg', 'numeric'].indexOf(attr.type) >= 0 && attr.value && (locale === null || attr.locale === locale)) {
                console.log(` - attr ${attr.name} mapped for ${result.id} to ${attr.value}`)
                result[attr.name] = attr.value
            }
        }        
    }

    resultTemplate (entityType) {
        return Object.assign({}, require(`./templates/${entityType}.json`))
    }
}