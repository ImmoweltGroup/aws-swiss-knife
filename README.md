# AWS Swiss Knife

## Work in progress

This repository is work in progress some functions may not work or contain bugs

## Installation

Install globally using yarn/npm

    yarn global add @immowelt/aws-swiss-knife
    npm i -g @immowelt/aws-swiss-knife
    
## Usage

When installed globally, simply call `awsk` on your shell

### Commands

| namespace | command | description |
|---|---|---|
| DynamoDB | `awsk dynamodb purge` | Deletes all items in one table |
| DynamoDB | `awsk dynamodb sync` | Copies all items of one table into another |
| SQS | `awsk sqs replay` | Reads & deletes all messages from one queue and adds them to another |

Every command supports `--help` to get information about arguments & options.  

## Maintainers

* [Matthias Rohmer](https://github.com/mrohmer)  
<matthias.rohmer@immowelt.de>  
* [Dennis Kribl](https://github.com/denniskribl)  
<dennis.kribl@immowelt.de>
* [Thomas Wirth](https://github.com/wtho)  
<thomas.wirth@immowelt.de>

## License
MIT
