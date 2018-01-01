const config = require('../config.json')
const PimcoreApiClient = require('./lib/pimcore-api')
const api = new PimcoreApiClient(config.pimcore)

const ProductImpoter = require('./importers/product')
const BasicImporter = require('./importers/basic')
const CategoryImpoter = require('./importers/category')
const _ = require('lodash')
const attribute = require('./lib/attribute')

const promiseLimit = require('promise-limit')
const limit = promiseLimit(3) // limit N promises to be executed at time
const promise = require('./lib/promise') // right now we're using serial execution because of recursion stack issues
const path = require('path')
const shell = require('shelljs')
const fs = require('fs')

const { spawn } = require('child_process');

const es = require('elasticsearch')
let client = new es.Client({ // as we're runing tax calculation and other data, we need a ES indexer
    host: config.elasticsearch.host,
    log: 'error',
    apiVersion: '5.5',
    requestTimeout: 50000
})

const CommandRouter = require('command-router')
const cli = CommandRouter()

cli.option({ name: 'offset'
, alias: 'p'
, default: 0
, type: Number
})
cli.option({ name: 'limit'
, alias: 'l'
, default: 10
, type: Number
})

cli.option({ name: 'switchPage'
, alias: 's'
, default: true
, type: Boolean
})

function recreateTempIndex() {
    return client.indices.delete({
        index: config.elasticsearch.indexName + '_temp'
    }).then((result) => {
        console.log(result)
        client.indices.create({ index: config.elasticsearch.indexName + '_temp' }).then(result=>{
            console.log(result)
        })
    })    
}

function storeResults(singleResults, entityType) {
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
}


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
            queue.push(() => importer.single(objDescriptor).then((singleResults) => {
                storeResults(singleResults, entityType)
                console.log('* Record done for ', objDescriptor.id, index, count)
                index++
            }))
        }
        promise.serial(queue).then((results) => {
            console.log('** Page done ', offset, resp.body.total)
            
            if(resp.body.total === count)
            {
                try {
                    global.gc();
                  } catch (e) {
                    console.log("WARNING: You can run program with 'node --expose-gc index.js' or 'npm start'");
                  }

                if(cli.options.switchPage) {
                    console.log('*** Switching page!')
                    return importListOf(entityType, importer, config, api, offset += count, count) 
                }
            }
        }).catch((reason) => { console.error(reason) })
    })
}
// TODO: 
//  1. Add taxrules importer
//  2. Images server
//  3. Add index emptying / temp index creation and aliases
//  4. Add root category selector (as numeric value) to the setup process 
//  5. Add styles for color attributes like "white, black" etc 
// EXTRA: Interprocess cache for attributes

cli.command('products',  () => {
    importListOf('product', new BasicImporter('product', new ProductImpoter(config, api, client), config, api, client), config, api, offset = cli.options.offset, count = cli.options.limit)
});

cli.command('clear',  () => {
    recreateTempIndex()
});

cli.command('categories',  () => { 
    let importer = new BasicImporter('category', new CategoryImpoter(config, api, client), config, api, client) // ProductImporter can be switched to your custom data mapper of choice
    importer.single({ id: config.pimcore.rootCategoryId }, level = 1, parent_id = 1).then((results) => {
        let fltResults = _.flattenDeep(results)
        storeResults(fltResults, 'category')
     })});

/**
 * Download asset and return the meta data as a JSON 
 */
cli.command('asset', () => {
    if(!cli.options.id) {
        console.log(JSON.stringify({ status: -1, message: 'Please provide asset Id'}))
        process.exit(-1)
    }
    api.get(`asset/id/${cli.options.id}`).end((resp) => {
        if(resp.body && resp.body.data) {
            const imageName =  resp.body.data.filename
            const imageRelativePath = resp.body.data.path
            const imageAbsolutePath = path.join(config.pimcore.assetsPath, imageRelativePath, imageName)
            
            shell.mkdir('-p', path.join(config.pimcore.assetsPath, imageRelativePath))
            fs.writeFileSync(imageAbsolutePath, Buffer.from(resp.body.data.data, 'base64'))
            console.log(JSON.stringify({ status: 0, message: 'Image downloaded!', absolutePath: imageAbsolutePath, relativePath: path.join(imageRelativePath, imageName) }))
        }
    })    
})

cli.on('notfound', (action) => {
  console.error('I don\'t know how to: ' + action)
  process.exit(1)
})
  
  
process.on('unhandledRejection', (reason, p) => {
  console.error('Unhandled Rejection at: Promise', p, 'reason:', reason);
   // application specific logging, throwing an error, or other logic here
});

process.on('uncaughtException', function (exception) {
    console.errorlog(exception); // to see your exception details in the console
    // if you are on production, maybe you can send the exception details to your
    // email as well ?
});
  
 
  // RUN
cli.parse(process.argv);


// FOR DEV/DEBUG PURPOSES

cli.command('testcategory',  () => {
    let importer = new BasicImporter('category', new CategoryImpoter(config, api, client), config, api, client) // ProductImporter can be switched to your custom data mapper of choice
    importer.single({ id: 11148 }).then((results) => {
        let fltResults = _.flattenDeep(results)
        let obj = fltResults.find((it) => it.dst.id === 11148)
        console.log('CATEGORIES', fltResults.length, obj, obj.dst.children_data)
        console.log('ATTRIBUTES', attribute.getMap())
        console.log('CO', obj.dst.configurable_options)
     }).catch((reason) => { console.error(reason) })
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
    }).catch((reason) => { console.error(reason) })
   // TODO: Tax Rules by template (taxrules.json)
   // TODO: Search index aliasing (temp indexes)
   // In general: populate the ES index from scratch, using Magento templates and adding custom Pimcore attributes and categories
});
  
// Using a single function to handle multiple signals
function handle(signal) {
    console.log('Received  exit signal. Bye!');
    process.exit(-1)
  }
process.on('SIGINT', handle);
process.on('SIGTERM', handle);
