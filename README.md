# Bridge validator

Bridge validator is bridge token/NFT contract to multi chains

## Getting started
### Requirements
- Nodejs
- npm/yarn 
- Mongodb
- Redis
### Setup
- Config your validator for Ethereum: create `local.json` in `config` directory with the following content
```
{
     "signer": "<put private key of your DTO deposit wallet>"
}
```
- install submodule and library
```
git submodule update --init
npm install
```

### Run
- start api
```
npm run start
```
- crawl data
```
npm run request
```

## Contribute

Bridge validator exists thanks to its contributors. There are many ways you can participate and help build high quality software. Check out the [contribution guide](CONTRIBUTING.md)!

## License

Bridge validator is released under the [MIT License](LICENSE).