sudo apt-get update &&
echo "deb http://security.ubuntu.com/ubuntu impish-security main" | sudo tee /etc/apt/sources.list.d/impish-security.list &&
sudo apt-get update &&
sudo apt-get install libssl1.1 &&

apt install mongodb-org &&

service mongod start &&

curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash &&
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
source ~/.bashrc &&
source ~/.profile &&
nvm install 17 &&
nvm use 17 &&

git clone https://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@github.com/dotoracle/bridge-validator.git &&
git clone https://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@github.com/dotoracle/casper-consumer.git &&

cd bridge-validator &&
git pull &&
git checkout mainnet &&
rm -rf node_modules &&
npm i &&
git submodule update --init &&
cd casper-contract-hash &&
git pull &&
git checkout master &&
cd .. &&

cd packages &&
git pull origin master &&
git checkout master &&
cd .. &&

npm run dist &&

npm i pm2 --global &&

pm2 start requestEvent.js --watch --name requestEvent.dotoracle &&
pm2 start index.js --watch --name api.dotoracle &&
pm2 start casper/caspercrawler.js --watch --name caspercrawl.dotoracle &&


cd ../casper-consumer &&

git checkout mainnet &&
git pull &&
npm i &&
git submodule update --init &&
cd packages &&
git pull origin master &&
git checkout master &&

cd .. &&
npm run dist &&

pm2 start newConsumer.js --watch --name casperConsumer.dotoracle