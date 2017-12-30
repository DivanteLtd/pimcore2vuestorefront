const _ = require('lodash');
const fs = require('fs')
const path = require('path')
const shell = require('shelljs')
const attribute = require('../lib/attribute')

module.exports = class {
    constructor(config, api, db) {
        this.config = config
        this.db = db
        this.api = api
        this.single = this.single.bind(this)
    }

    /**
     * This is an EXAMPLE of custom Product / entity mapper; you can write your own to map the Pimcore entities to vue-storefront data format (see: templates/product.json for reference)
     * @returns Promise
     */
    single(pimcoreObjectData, convertedObject, childObjects, level = 1) {
        return new Promise((resolve, reject) => {
            console.log('Helo from custom category converter for', convertedObject.id)
            convertedObject.url_key = pimcoreObjectData.key // pimcoreObjectData.path?
            convertedObject.level = level
            convertedObject.parent_id = pimcoreObjectData.parentId
            let subPromises = []

            convertedObject.children_data = [] // clear the options
            if (childObjects && childObjects.length){
                // here we're flattening the child array out, because it's specific to pimcore that children can have children here :)

                let childObjectsFlattened = _.flattenDeep(childObjects)

                for(let childObject of childObjectsFlattened) {
                    if(childObject.src.parentId === convertedObject.id) {
                        console.log('Adding category child for ', convertedObject.name, convertedObject.id, childObject.dst.name)
                        let confChild = {
                            name: childObject.dst.name,
                            id: childObject.dst.id,
                            parent_id: convertedObject.id,
                            is_active: true,
                            level: level + 1,
                            children_data: childObject.dst.children_data
                        }
                        
                        convertedObject.children_data.push(confChild)
                    }
                }
                console.debug(' - Category children for: ', convertedObject.id,  convertedObject.children_data.length, convertedObject.children_data)
            }
            
            Promise.all(subPromises).then(results => {
                resolve({ src: pimcoreObjectData, dst: convertedObject })
            })
        })
    }
}