const express = require('express');
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');
const mime = require('mime-types');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const port = 3000;
const websocket = new WebSocket.Server({ server: server });

const processUrl = (string) => {
    if (!string.match(/\.[a-zA-Z0-9]+/)) {
        return string + ".html";
    }
    return string;
}
const localize = (file) => { return `./files${file}` }

const openSockets = [];
const files = [];

function track(file) {
    file = processUrl(file);
    // console.log("adding", file, files);
    if (!files.includes(file) && file.endsWith(".html")) {
        files.push(file);
        // console.log("success");
        // console.log(localize(processUrl(file)))
        fs.watch(localize(file), {}, (event) => {
            // console.log(event);
            for (let i = 0; i < openSockets.length; i++) {
                const element = openSockets[i];
                if (element != undefined) {
                    if (processUrl(element.page) == file) {
                        element.close();
                        delete openSockets[i];
                    }
                }
            }
        })
    }
}

websocket.on('connection', socket => {
    socket.id = uuidv4();
    openSockets.push(socket);
    // console.log(`[WEBSOCKET] connected client ${socket.id}`);
    socket.on('message', message => {
        // console.log(`[WEBSOCKET] you got mail from client ${socket.id}:`, message.toString());
        // assuming client sent the requested url
        socket.page = message.toString();
        track(message.toString());
    });
    socket.on('close', (code, reason) => {
        // console.log(`[WEBSOCKET] disconnected client ${socket.id}: ${code} ${reason}`);
        delete openSockets.find((e) => e == socket);
    });
    socket.on('error', error => {
        // console.error(`[WEBSOCKET] error on client ${socket.id}:`, error);
    });
});

app.get("*", (req, res) => {
    if (req.url == "/") {
        res.redirect("/index");
        return
    }

    var origin = req.url;

    req.url = processUrl(req.url);
    console.log(`[${req.method}] ${origin} => ${localize(req.url)}`)

    if (fs.existsSync(localize(req.url))) {
        const buf = fs.readFileSync(localize(req.url))
        res.status(200)
        var resp = buf.toString();
        if (req.url.endsWith(".html")) {
            resp += `
            <script>
                const socket = new WebSocket("ws://localhost:${port}")
                socket.addEventListener("open", event => {
                    console.log("connected to server")    
                    socket.send(location.href.replace(location.origin, ''));
                })
                
                socket.addEventListener("close", event => {
                    console.log("closed", event.code)
                    if (event.code != 1001 && event.code != 1006) {
                        location.reload()
                    }
                    if (event.code == 1006) {
                        console.log("lost connection to server. reload page to try again");
                    }
                })
            </script>
            `
        }
        if (mime.lookup(req.url) != "text/html") {
            res.set('Content-Type', mime.lookup(req.url))
            res.set('Content-Disposition', 'inline');
            res.send(buf);
        } else {
            res.send(resp)
        }
    } else {
        res.status(404)
        const buf = fs.readFileSync("404.html")
        res.send(buf.toString());
    }
})

server.listen(port, () => {
    console.log(`app on port ${port}`)
})