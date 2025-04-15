APP_VERSION=$(jq -r '.version' package.json)
echo "Building v$APP_VERSION"
npm i
npm run build

# proddir=/Users/fred/Downloads/tradeecomm
proddir=/opt/jenkins/fredsit/tradeecomm

npm prune --omit=dev
chmod 660 .env

echo "removing existing app"
rm -rf $proddir
mkdir -p $proddir/build

echo "copying in node_modules"
cp -rL node_modules .env $proddir/
echo "copying in new app"
cp -r .output/* $proddir/build

echo "restarting app service"
sudo systemctl restart trade-ecomm
echo "complete"