'use strict'

const shell = require('shelljs')
const mkdirp = require('mkdirp')
const exists = require('fs-exists-sync')
const inquirer = require('inquirer')
const jsonFile = require('jsonfile')
const urlParser = require('url-parse')
const isWindows = require('is-windows')
const isEmptyDir = require('empty-dir')
const commandExists = require('command-exists')
const validUrl = require('valid-url');
const path = require('path')

const PimcoreApiClient = require('./src/lib/pimcore-api')
let api

const TARGET_CONFIG_FILE = 'config.json'
const SOURCE_CONFIG_FILE = 'config.example.json'

const SELF_DIRECTORY = shell.pwd()

const LOG_DIR = `${SELF_DIRECTORY}/var/log`
const INSTALL_LOG_FILE = `${SELF_DIRECTORY}/var/log/install.log`
const GENERAL_LOG_FILE = `${SELF_DIRECTORY}/var/log/general.log`

const Message = require('./src/lib/message.js')

/**
 * Abstract class for field initialization
 */
class Abstract {
  /**
   * Constructor
   *
   * Initialize fields
   */
  constructor (answers) {
    this.answers = answers
  }
}


/**
 * Scripts for initialization of Pimcore instance
 */
class Pimcore extends Abstract {
  /**
   * Creating storefront config.json
   *
   * @returns {Promise}
   */
  createConfig () {
    return new Promise((resolve, reject) => {
      let config

      Message.info(`Creating pimcore config '${TARGET_CONFIG_FILE}'...`)

      try {
        config = jsonFile.readFileSync(SOURCE_CONFIG_FILE)

        let backendPath

        const pimcoreClassFinder = function (className) {
          return availablePimcoreClassess.find((itm) => { return itm.name === className })
        }

        config.elasticsearch.host = this.answers.elasticsearchUrl
        config.elasticsearch.indexName = this.answers.elasticsearchIndexName
        config.pimcore.url = this.answers.pimcoreUrl
        config.pimcore.assetsPath = this.answers.assetsPath
        config.pimcore.apiKey = this.answers.apiKey
        config.pimcore.locale = this.answers.locale
        config.pimcore.productClass = Object.assign(config.pimcore.productClass, pimcoreClassFinder(this.answers.productClass))
        config.pimcore.categoryClass = pimcoreClassFinder(this.answers.categoryClass)
        
        jsonFile.writeFileSync(TARGET_CONFIG_FILE, config, {spaces: 2})
      } catch (e) {
        reject('Can\'t create storefront config.')
      }

      resolve()
    })
  }


  /**
   * Start 'npm run import' in background
   *
   * @returns {Promise}
   */
  runImporter (answers) {
    return new Promise((resolve, reject) => {
      Message.info('Starting Pimcore inporter ...')

      if (shell.exec(`nohup npm run importer >> ${Abstract.logStream} 2>&1 &`).code !== 0) {
        reject('Can\'t start storefront server.', GENERAL_LOG_FILE)
      }

      resolve(answers)
    })
  }
}

class Manager extends Abstract {
  /**
   * {@inheritDoc}
   *
   * Assign backend and storefront entities
   */
  constructor (answers) {
    super(answers)

    this.pimcore = new Pimcore(answers)
  }

  /**
   * Trying to create log files
   * If is impossible - warning shows
   *
   * @returns {Promise}
   */
  tryToCreateLogFiles () {
    return new Promise((resolve, reject) => {
      Message.info('Trying to create log files...')

      try {
        mkdirp.sync(LOG_DIR, {mode: parseInt('0755', 8)})

        let logFiles = [
          INSTALL_LOG_FILE,
          GENERAL_LOG_FILE
        ]

        for (let logFile of logFiles) {
          if (shell.touch(logFile).code !== 0 || !exists(logFile)) {
            throw new Error()
          }
        }

        Abstract.logsWereCreated = true
        Abstract.infoLogStream = INSTALL_LOG_FILE
        Abstract.logStream = GENERAL_LOG_FILE
      } catch (e) {
        Message.warning('Can\'t create log files.')
      }

      resolve()
    })
  }

  
  /**
   * Initialize all processes for storefront
   *
   * @returns {Promise}
   */
  initPimcore () {
    return this.pimcore.createConfig.bind(this.pimcore)()
      .then(this.pimcore.runImporter.bind(this.pimcore))
  }

  /**
   * Check user OS and shows error if not supported
   */
  static checkUserOS () {
    if (isWindows()) {
      Message.error([
        'Unfortunately currently only Linux and OSX are supported.',
        'To install vue-storefront on your mac please go threw manual installation process provided in documentation:',
        `${STOREFRONT_GIT_URL}/blob/master/doc/Installing%20on%20Windows.md`
      ])
    }
  }

  /**
   * Shows message rendered on the very beginning
   */
  static showWelcomeMessage () {
    Message.greeting([
      'Hi, welcome to the pimcore2vuestorefront setup.',
      'Let\'s configure it together :)'
    ])
  }

  /**
   * Shows details about successful installation finish
   *
   * @returns {Promise}
   */
  showGoodbyeMessage () {
    return new Promise((resolve, reject) => {
      Message.greeting([
        'Congratulations!',
        '',
        'You\'ve just configured Pimcore -> VueStorefront integrator.',
        '',
        'Good Luck!'
      ], true)

      resolve()
    })
  }
}

const urlFilter = function (url) {
    let prefix = 'http://'
    let prefixSsl = 'https://'

    url = url.trim()

    // add http:// if no protocol set
    if (url.substr(0, prefix.length) !== prefix && url.substr(0, prefixSsl.length) !== prefixSsl) {
      url = prefix + url
    }

    // add extra slash as suffix if was not set
    return url.slice(-1) === '/' ? url : `${url}/`
  }

let pimcoreUrl
let availablePimcoreClassess

/**
 * Here we configure questions
 *
 * @type {[Object,Object,Object,Object]}
 */
let questions = [
  {
    type: 'input',
    name: 'pimcoreUrl',
    message: 'Please provide Pimcore URL',
    filter: urlFilter,
    default: 'http://vue-catalog-pimcore.test.divante.pl/',
    when: function (answers) {
      return true
    },
    validate: function (value) {
      pimcoreUrl = value

    if (validUrl.isUri(value)){
      return true
    } 
    else {
      return 'Provide a valid Pimcore URI'
    }

      return true
    }
  },
  {
    type: 'input',
    name: 'apiKey',
    message: 'Please provide valid Pimcore API Key',
    default: 'da6cb4a55ead8faffebcf5ed96ba2796536044247f08f37c49dd2dac84b67974',
    when: function (answers) {
      return true
    },
    validate: function (value) {
      var done = this.async();
      api = new PimcoreApiClient({
        url: pimcoreUrl,
        apiKey: value
      })
      try {
        api.get('classes').end((resp) => {
          if (resp.body.success == false) {
            done (resp.body.msg)
          } else {
            availablePimcoreClassess = resp.body.data
            done(null, true)
          }
        })
      } catch (err) {
        console.error(err)
        done('Please provide valid URL and API Key for Pimcore')
      }
    }
  },  
  {
    type: 'input',
    name: 'elasticsearchUrl',
    message: 'Please provide Elastic Search URL',
    default: 'http://localhost:9200',
    filter: urlFilter,
    when: function (answers) {
        return true
    },
    validate: function (value) {
      return true
    }
  },
  {
    type: 'input',
    name: 'elasticsearchIndexName',
    message: 'Please provide the Elastic Search index name for vue-storefront',
    default: 'vue_storefront_catalog',
    when: function (answers) {
      return true
    },
    validate: function (value) {
      return true
    }
  },
  {
    type: 'input',
    name: 'assetsPath',
    message: 'Enter the assets path. Pimcore images will be downloaded in here:',
    default: path.normalize(__dirname + '/var/assets'),
    when: function (answers) {
      return true
    },
    validate: function (value) {
      return true
    }
  },  
  {
    type: 'choice',
    name: 'locale',
    message: 'Which language version should be synchronized',
    default: 'en_GB',
    choices: ['en_GB', 'de_AT', 'de_DE', 'pl_PL', 'fr_FR', 'en_US'],
    when: function (answers) {
        return true
    },
    validate: function (value) {
      return true
    }
  },  
  {
    type: 'list',
    choices: function(answers) { return availablePimcoreClassess.map((itm) => { return itm.name }) },
    
    name: 'productClass',
    message: 'Please select valid Pimcore class for Product entities',
    default: 'Product',
    when: function (answers) {
      return true
    },
    validate: function (value) {
      return true
    }
  },
  {
    type: 'list',
    choices: function(answers) { return availablePimcoreClassess.map((itm) => { return itm.name }) },
    
    name: 'categoryClass',
    message: 'Please select valid Pimcore class for Category entities',
    default: 'ProductCategory',
    when: function (answers) {
      return true
    },
    validate: function (value) {
      return true
    }
  },  
]

/**
 * Predefine class static variables
 */
Abstract.logsWereCreated = false
Abstract.infoLogStream = '/dev/null'
Abstract.logStream = '/dev/null'

if (require.main.filename === __filename) {
  /**
   * Pre-loading staff
   */
  Manager.checkUserOS()
  Manager.showWelcomeMessage()

  /**
   * This is where all the magic happens
   */
  inquirer.prompt(questions).then(async function (answers) {
    let manager = new Manager(answers)

    await manager.tryToCreateLogFiles()
      .then(manager.initPimcore.bind(manager))
      .then(manager.showGoodbyeMessage.bind(manager))
      .catch(Message.error)

    shell.exit(0)
  })
} else {
  module.exports.Message = Message
  module.exports.Manager = Manager
  module.exports.Abstract = Abstract
  module.exports.TARGET_CONFIG_FILE = TARGET_CONFIG_FILE
}
