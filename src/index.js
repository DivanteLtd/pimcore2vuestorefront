const config = require('../config.json')
const PimcoreApiClient = require('./lib/pimcore-api')
const api = new PimcoreApiClient(config.pimcore)

const ProductImpoter = require('./importers/product')
const BasicImporter = require('./importers/basic')
const CategoryImpoter = require('./importers/category')
const _ = require('lodash')
const attribute = require('./lib/attribute')
const promiseLimit = require('promise-limit')
const limit = promiseLimit(2) // limit N promises to be executed at time


const es = require('elasticsearch')
let client = new es.Client({ // as we're runing tax calculation and other data, we need a ES indexer
    host: config.elasticsearch.host,
    log: 'error',
    apiVersion: '5.5',
    requestTimeout: 50000
})

const CommandRouter = require('command-router')
const cli = CommandRouter()



/**
 * Import full list of specific entites
 * @param {String} entityType 
 * @param {Object} importer 
 */
function importListOf(entityType, importer, config, api, offset = 0, count = 100) {
    let entityConfig = config.pimcore[`${entityType}Class`]
    if (!entityConfig) {
        throw new Error(`No Pimcore class configuration for ${entityType}`)
    }

    const query = { // TODO: add support for `limit` and `offset` paramters
        objectClass: entityConfig.name,
        offset: offset,
        limit: count
    }

    let generalQueue = []
    console.log('*** Getting objects list for', query)
    api.get('object-list').query(query).end((resp) => {
        
        let queue = []
        let index = 0
        for(let objDescriptor of resp.body.data) {
            queue.push(limit(() => importer.single(objDescriptor).then((singleResults) => {
                let fltResults = _.flattenDeep(singleResults)
                let attributes = attribute.getMap()

                fltResults.map((ent) => {
                    client.index({
                        index: config.elasticsearch.indexName + '_temp',
                        type: entityType,
                        id: ent.dst.id,
                        body: ent.dst
                    })                    
                })
                Object.values(attributes).map((attr) => {
                    client.index({
                        index: config.elasticsearch.indexName + '_temp',
                        type: 'attribute',
                        id: attr.id,
                        body: attr
                    })                    
                })                
                console.log('* Record done for ', objDescriptor.id, index, count)
                index++
            }))) // TODO: queue and add paging
        }
        Promise.all(queue).then((results) => {
            console.log('** Page done ', offset, resp.body.total)
            
            if(resp.body.total === count)
            {
                console.log('*** Switching page!')
                return importListOf(entityType, importer, config, api, offset += count, count) 
            }
        })
    })
}

cli.command('attributes',  () => { // Simply load attributes description from templates/attributes.json instead of dynamic mapping from pimcore
});

cli.command('testcategory',  () => {
    let importer = new BasicImporter('category', new CategoryImpoter(config, api, client), config, api, client) // ProductImporter can be switched to your custom data mapper of choice
    importer.single({ id: 11148 }).then((results) => {
        let fltResults = _.flattenDeep(results)
        let obj = fltResults.find((it) => it.dst.id === 11148)
        console.log('CATEGORIES', fltResults.length, obj, obj.dst.children_data)
        console.log('ATTRIBUTES', attribute.getMap())
        console.log('CO', obj.dst.configurable_options)
     })
    // TODO: Tax Rules by template (taxrules.json)
    // TODO: Search index aliasing (temp indexes)
    // In general: populate the ES index from scratch, using Magento templates and adding custom Pimcore attributes and categories
 });
 

cli.command('testproduct',  () => {
   let importer = new BasicImporter('product', new ProductImpoter(config, api, client), config, api, client) // ProductImporter can be switched to your custom data mapper of choice
   importer.single({ id: 1237 }).then((results) => {
       let fltResults = _.flatten(results)
       let obj = fltResults.find((it) => it.dst.id === 1237)
       console.log('PRODUCTS', fltResults.length, obj, obj.dst.configurable_children)
       console.log('ATTRIBUTES', attribute.getMap())
       console.log('CO', obj.dst.configurable_options)
    })
   // TODO: Tax Rules by template (taxrules.json)
   // TODO: Search index aliasing (temp indexes)
   // In general: populate the ES index from scratch, using Magento templates and adding custom Pimcore attributes and categories
});


cli.command('products',  () => {
    importListOf('product', new BasicImporter('product', new ProductImpoter(config, api, client), config, api, client), config, api)
});

cli.command('categories',  () => { // TODO: modify to import only the root category tree not plain list of all categories
    importListOf('category', new BasicImporter('category', new CategoryImpoter(config, api, client), config, api, client), config, api)
});
  
cli.on('notfound', (action) => {
  console.error('I don\'t know how to: ' + action)
  process.exit(1)
})
  
  
process.on('unhandledRejection', (reason, p) => {
  console.error('Unhandled Rejection at: Promise', p, 'reason:', reason);
   // application specific logging, throwing an error, or other logic here
});
  
  
  // RUN
cli.parse(process.argv);

  