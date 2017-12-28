const config = require('../config.json')
const PimcoreApiClient = require('./lib/pimcore-api')
const api = new PimcoreApiClient(config.pimcore)

const ProductImpoter = require('./importers/product')
const BasicImporter = require('./importers/basic')
const CategoryImpoter = require('./importers/category')

const es = require('elasticsearch')
let client = new es.Client({ // as we're runing tax calculation and other data, we need a ES indexer
    host: config.elasticsearch.host,
    log: 'debug',
    apiVersion: '5.5',
    requestTimeout: 5000
})

const CommandRouter = require('command-router')
const cli = CommandRouter()



/**
 * Import full list of specific entites
 * @param {String} entityType 
 * @param {Object} importer 
 */
function importListOf(entityType, importer, config, api) {
    let entityConfig = config.pimcore[`${entityType}Class`]
    if (!entityConfig) {
        throw new Error(`No Pimcore class configuration for ${entityType}`)
    }

    const query = { // TODO: add support for `limit` and `offset` paramters
        objectClass: entityConfig.name,
        limit: 10
    }
    
    let queue = []
    console.log('Getting objects list for', query)
    api.get('object-list').query(query).end((resp) => {
        for(let objDescriptor of resp.body.data) {
            queue.push(importer.single(objDescriptor)) // TODO: queue;
        }
        Promise.all(queue).then((results) => {
//            console.log(results)
        })
    })
}

cli.command('attributes',  () => { // Simply load attributes description from templates/attributes.json instead of dynamic mapping from pimcore
});

cli.command('testproduct',  () => {
   let importer = new BasicImporter('product', new ProductImpoter(config, api, client), config, api, client) // ProductImporter can be switched to your custom data mapper of choice
   importer.single({ id: 1237 }).then((results) => {
   })
});


cli.command('products',  () => {
    importListOf('product', new BasicImporter('product', new ProductImpoter(config, api, client), config, api, client), config, api)
});

cli.command('categories',  () => {
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

  