# Vue Storefront - PWA for eCommerce
Vue Storefront is a standalone PWA storefront for your eCommerce, possible to connect with any eCommerce backend (eg. Magento, Pimcore, Prestashop or Shopware) through the API.

Sign up for a demo at https://vuestorefront.io/ (Vue Storefront integrated with Pimcore OR Magento2).



# Pimcore data bridge
Vue Storefront is platform agnostic - which mean: it can be connected to virtually any eCommerce CMS. This project is a data connector for *Pimcore eCommerce Framework*.
Pimcore data bridge converts Pimcore objects to Vue-storefront data structures (see [Vue Storefront data formats](https://github.com/DivanteLtd/vue-storefront/blob/master/doc/ElasticSearch%20data%20formats.md)). 
You can check [Magento2vuestorefront bridge](https://github.com/DivanteLtd/mage2vuestorefront) for reference as well, however the architecture of these tools differs in many aspects as the CMSes were designed with different philosophies.

# Data formats
As Pimcore is a very extensible Framework, the data structures and format may vary. By default we're supporting official eCommerce Framework data structures which you can check in [Pimcore Advanced eCommerce demo](https://pimcore.com/en/try).
For demonstration purposes we do support pretty basic elements of eCommerce Framework data structures:
- set of required attributes

# Setup and installation
The project contains very straightforward installer.
