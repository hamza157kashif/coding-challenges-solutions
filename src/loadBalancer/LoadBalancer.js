const express = require('express');
const request = require('request');
const app = express();

app.use((req, res, next) => {
    console.log(`Received request from ${req.ip}/n`);
    console.log(`${req.method} ${req.url}/n`);
    console.log(`Host: ${req.headers.host}/n`);
    console.log(`User-Agent: ${req.headers['user-agent']}/n`);
    console.log(`Accept: ${req.headers.accept}/n`);
    next();
});

app.get('/', () =>{
    console.log('get /')
})
app.listen(5500, () => {
    console.log('Load Balancer is running on port 5500')
});