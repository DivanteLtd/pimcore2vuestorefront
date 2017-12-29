const _ = require('lodash');
const fs = require('fs')
const path = require('path')
const shell = require('shelljs')

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
    single(pimcoreObjectData, convertedObject, childObjects) {
        return new Promise((resolve, reject) => {
            console.log('Helo from custom product converter for', convertedObject.id)
            convertedObject.url_key = pimcoreObjectData.key // pimcoreObjectData.path?
            convertedObject.type_id = (childObjects.length > 0) ? 'configurable' : 'simple'

            let elements = pimcoreObjectData.elements
            let features = elements.find((elem) => elem.name === 'features')
            let categories = elements.find((elem) => elem.name === 'categories')
            let images = elements.find((elem) => elem.name === 'images')
            let materialComposition = elements.find((elem) => elem.name === 'materialComposition')
            let color = elements.find((elem) => elem.name === 'color')
            let gender = elements.find((elem) => elem.name === 'gender')
            let size = elements.find((elem) => elem.name === 'size')

            let localizedFields = elements.find((itm)=> { return itm.name === 'localizedfields'})

            if(size && size.value)
                convertedObject.size = size.value
            
            if(color && color.value)
                convertedObject.color = Array.isArray(color.value) ? color.value.join(', ') : color.value // TODO: map to Magento attribute IDs?

            // TODO: map product attributes regarding the templates/attributes.json configuration
            //console.log(pimcoreObjectData)
            let subPromises = []

            let imagePromises = []
            if(images) {
                
                images.value.map((imgDescr) => {
                    let imgId = imgDescr.value[0].value
                    imagePromises.push(new Promise((imgResolve, imgReject) => {
                        this.api.get(`asset/id/${imgId}`).end((resp) => {
                            if(resp.body && resp.body.data) {
                                const imageName =  resp.body.data.filename
                                const imageRelativePath = resp.body.data.path
                                const imageAbsolutePath = path.join(this.config.pimcore.assetsPath, imageRelativePath, imageName)
                                
                                shell.mkdir('-p', path.join(this.config.pimcore.assetsPath, imageRelativePath))
                                fs.writeFileSync(imageAbsolutePath, Buffer.from(resp.body.data.data, 'base64'))
                                console.log(`File ${imageName} stored to ${imageAbsolutePath}`)
                                convertedObject.image = path.join(imageRelativePath, imageName)
                                imgResolve()
                            }
                        })
                    }))
                })
            }

            Promise.all(imagePromises).then((result) => {
                
                if(features) {
                    features.value.map((featDescr) => {
                        subPromises.push((this.api.get(`object/id/${featDescr.id}`).end((resp) => {
                        //  console.log('Feature', resp.body.data.elements.find((el) => { return el.name === 'localizedfields'}))
                        })))
                    })
                }

                if(categories) {
                    categories.value.map((catDescr) => {
                        subPromises.push(this.api.get(`object/id/${catDescr.id}`).end((resp) => {
                        // console.log('Category', resp.body.data.elements.find((el) => { return el.name === 'localizedfields'}))
                        }))
                    })
                }

                convertedObject.configurable_children = [] // clear the options
                if (convertedObject.type_id === 'configurable'){
                    // here we're flattening the child array out, because it's specific to pimcore that children can have children here :)

                    let childObjectsFlattened = _.flatten(childObjects)

                    let color_options = []
                    let size_options = []
                    for(let childObject of childObjectsFlattened) {
                        let confChild = {
                            name: childObject.dst.name,
                            sku: childObject.dst.sku,
                            price: childObject.dst.price
                        }
                        if(_.trim(childObject.dst.color) != '')
                            color_options.push(childObject.dst.color)

                        if(_.trim(childObject.dst.size))
                            size_options.push(childObject.dst.size)

                        confChild.custom_attributes = [ // other custom attributes can be stored here as well
                            {
                                "value": childObject.dst.url_key,
                                "attribute_code": "url_key"
                            },
    /*                        {
                                "value": childObject.dst.small_image,
                                "attribute_code": "small_image"
                            },*/
                            {
                                "value": childObject.dst.image,
                                "attribute_code": "image"
                            },
                            {
                                "value": childObject.dst.size, // these attributes are used for configuration, todo: map to attribute dictionary to be used in Magento
                                "attribute_code": "size"
                            },
                            {
                                "value": childObject.dst.color, // TODO: map to enumerable attribute to be used in Magento - because are dictionary attrs in Magento
                                "attribute_code": "color"
                            },
                            
    /*                        {
                                "value": childObject.dst.thumbnail,
                                "attribute_code": "thumbnail"
                            }*/
                        ]
                        
                        
                        convertedObject.configurable_children.push(confChild)
                    }
                    console.debug(' - Configurable children for: ', convertedObject.id,  convertedObject.configurable_children.length, convertedObject.configurable_children)
                    convertedObject.color_options = color_options // this is vue storefront feature of setting up the combined options altogether in the parent for allowing filters to work on configurable products
                    convertedObject.size_options = size_options

                }
                
                Promise.all(subPromises).then(results => {
                    resolve({ src: pimcoreObjectData, dst: convertedObject })
                })
            })
        })
    }
}