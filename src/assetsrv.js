const http = require('http');
const express = require('express');
const path = require('path')

let app = express();
app.server = http.createServer(app);

let rootDir = path.join(__dirname, '../var/assets/')

console.log('Root dir', rootDir)

app.use('/assets', express.static(rootDir))

app.server.listen(process.env.PORT || 8081, () => {
    console.log(`Started on port ${app.server.address().port}`);
});

