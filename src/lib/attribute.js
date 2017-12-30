const fs = require('fs')
const path = require('path')

let attrHash = {}
let maxAttrId = 1 // used for attr ids

exports.getMap = () => {
    return attrHash
}


function mapToVS (attributeCode, attributeType, attributeValue) {
    let attr = attrHash[attributeCode]
    if (! attr) {
        attr = attributeTemplate(attributeCode, attributeType)
        attr.id = maxAttrId
        attr.attribute_id = maxAttrId
        
        attrHash[attributeCode] = attr
        maxAttrId++
    } 
    if (attr.frontend_input == 'select') {
        let existingOption = attr.options.find((option) => { return option.label == attributeValue})
        if(!existingOption) {
            let lastOption = attr.options.length > 0 ? attr.options[attr.options.length-1] : null
            let optIndex = 1
            if (lastOption) {
                optIndex = lastOption.value + 1
            }
            attr.options.push({
                label: attributeValue,
                value: optIndex
            })
            return optIndex
        } else {
            return existingOption.value // non select attrs
        }


    } else {
        return attributeValue
        // we're fine here for decimal and varchar attributes
    }
}


function mapElements(result, elements, locale = null) {
    for(let attr of elements) {
        if(['multiselect', 'input', 'wysiwyg', 'numeric'].indexOf(attr.type) >= 0 && attr.value && (locale === null || attr.language == locale)) {
            console.log(` - attr ${attr.name} values: ${result.id} to ${attr.value}`)
            result[attr.name] = mapToVS(attr.name, attr.type, Array.isArray(attr.value) ? attr.value.join(', ') : attr.value)
            console.log(` - vs attr ${attr.name} values: ${result.id} to ${result[attr.name]}`)
        }
    } 
    return result       
}

function attributeTemplate(attributeCode, attributeType = null) { // TODO: if we plan to support not full reindexes then we shall load the attribute templates from ES (previously filled up attrbutes)
    if(!fs.existsSync(path.join(__dirname, `../importers/templates/attribute_code_${attributeCode}.json`))) {
        console.log(`Loading attribute by type ${attributeType}`)
        let attr = Object.assign({}, require(`../importers/templates/attribute_type_${attributeType}`))
        attr.attribute_code = attributeCode
        attr.default_frontend_label = attributeCode

        return attr
    }
    else {
        console.log(`Loading attribute by code ${attributeCode}`) // in this case we have pretty damn good attribute meta in template, like name etc
        return require(`../importers/templates/attribute_code_${attributeCode}`)
    }
}

exports.attributeTemplate = attributeTemplate
/**
 * Vue storefront needs - like Magento - attribute dictionary to be populated by attr specifics; and here we are!
 * @param {String} attributeCode 
 * @param {String} attributeType 
 * @param {mixed} attributeValue 
 */
exports.mapToVS = mapToVS

exports.mapElements = mapElements