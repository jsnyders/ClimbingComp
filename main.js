/*
 main.js
 REST server for climbing comp web app.

 Copyright (c) 2014, John Snyders

 ClimbingComp is free software: you can redistribute it and/or modify
 it under the terms of the GNU Affero General Public License as published by
 the Free Software Foundation, either version 3 of the License, or
 (at your option) any later version.

 ClimbingComp is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 GNU Affero General Public License for more details.

 You should have received a copy of the GNU Affero General Public License
 along with ClimbingComp.  If not, see <http://www.gnu.org/licenses/>.
*/
/* jshint node: true, strict: false */

/*
 * The main entry point for the ClimbingComp web app server.
 * It processes command line arguments, reads configuration, sets up a database connection pool,
 * gets configuration from the database, sets up restify server and adds all the needed resources.
 */

var fs = require('fs');
var bunyan = require('bunyan');
var restify = require("restify");
var db = require('mysql');
var htmlFormatter = require("./lib/htmlFormatter");

var version = "0.1.0";

//
// Command line parsing
//
var argv = require('yargs')
    .require(1, "Missing client-path") // xxx once there is a build for the client this can be defaulted
    .alias("level", "l")
    .default("level", "info")
    .describe("level", "Log level\n (fatal, error, warn, info, debug, trace)")
    .alias("port", "p")
    .default("port", 8080)
    .describe("port", "Port to listen on")
    .alias("config", "c")
    .default("config", "config.json")
    .describe("config", "Configuration file")
    .usage("Usage: $0 [options] client-path")
    .wrap(78)
    .version(version, "version")
    .strict()
    .help("help", "Display usage")
    .alias("help", "h")
    .argv;

var mapLogLevel = {
    "fatal": bunyan.FATAL,
    "error": bunyan.ERROR,
    "warn": bunyan.ERROR,
    "info": bunyan.INFO,
    "debug": bunyan.DEBUG,
    "trace": bunyan.TRACE
};

var logLevel = mapLogLevel[argv.level.toLowerCase()];

if (!logLevel) {
    console.log("Invalid log level, using info");
    logLevel = bunyan.INFO;
}

var log = bunyan.createLogger({
    name: "ccsa",
    level: logLevel
});

//
// Load configuration
//

var config;
try {
    config = JSON.parse(fs.readFileSync(argv.config, 'utf8'));
} catch (ex) {
    console.log('Invalid JSON config file: ' + argv.config);
    process.exit();
}

var error = false;
["dbDatabase", "dbUser", "dbPassword"].forEach(function(prop) {
    if (!config[prop]) {
        console.log("Config file missing required property " + prop);
        error = true;
    }
    if (error) {
        process.exit();
    }
});

var clientRoot = argv._[0],
    protocol = "HTTP",
    port = argv.port;


log.debug("Log level: " + logLevel );
log.debug("Client Root: '" + clientRoot + "'");
log.debug("Database: '" + config.dbDatabase + "'");
log.debug("Database User: '" + config.dbUser + "'");
log.debug("key: " + config.keyFileName);
log.debug("cert: " + config.certFileName);

//
// Create database pool
//
var dbPool  = db.createPool({
    host: 'localhost',
    user: config.dbUser,
    password: config.dbPassword,
    database: config.dbDatabase
});

// Database config table data with defaults
var configuration = { };

// Test database connection and load configuration from database
dbPool.getConnection(function(err, conn) {
    if (err) {
        console.log("Failed to connect to the database. Check that database is running and verify database connection configuration.", err);
        process.exit();
    }
    conn.query("SELECT name, nvalue, tvalue from config", function(err, rows) {
        var i, row, value;

        conn.release();
        if (err) {
            console.log("Failed to read configuration from database.", err);
            process.exit();
        }

        for (i = 0; i < rows.length; i++) {
            row = rows[i];

            if (row.nvalue !== null) {
                value = row.nvalue;
            } else if (row.tvalue !== null) {
                value = row.tvalue;
            } else {
                value = null;
            }
            configuration[row.name] = value;
        }

        log.debug("Configuration: ", configuration);

        startServer(protocol, port);
    });
});


//
// Create restify server
//
var restifyOptions = {
    name: "ClimbingComp",
    log: log,
    formatters: htmlFormatter // added for HTML 404 errors for static files
};

if (config.keyFileName && config.certFileName) {
    restifyOptions.key = fs.readFileSync(config.keyFileName);
    restifyOptions.cert = fs.readFileSync(config.certFileName);
    protocol = "HTTPS";
    // todo xxx consider running on both HTTP and HTTPS or running HTTP just to redirect to HTTPS or use HTTPS just for login resource
}

var server = restify.createServer(restifyOptions);

log.debug("Server Acceptable: " + server.acceptable);

server.use(restify.acceptParser(server.acceptable));
server.use(restify.queryParser());
server.use(restify.bodyParser({ mapParams: false, uploadDir: "./uploads" }));
server.use(restify.gzipResponse());
server.use(restify.conditionalRequest());
server.use(restify.requestLogger());

var auth = require("./lib/auth");
server.use(auth.authCheck(dbPool));

server.on('after', restify.auditLogger({
    log: bunyan.createLogger({
        name: 'audit',
        streams: [
            {
                path: "audit.log" // xxx configure this
            }
        ]
    })
}));

server.on("request", function(req, res) {
    log.info({
        req_id: req.id(),
        method: req.method,
        url: req.url,
        headers: req.headers,
        remoteAddress: req.remoteAddress,
        remotePort: req.remotePort
    }, "request received");
});

//
// Redirect to the static webapp page
//
server.get("/", function(req,res,next) {
    res.header("Location", "/ClimbingComp.html");
    res.send(303, "See Other");
    return next();
});

require("./lib/resources/authSessions").addResources(server, dbPool);

require("./lib/resources/events").addResources(server, dbPool);

require("./lib/resources/climbers").addResources(server, dbPool);

require("./lib/resources/eventClimbers").addResources(server, dbPool);

require("./lib/resources/eventRoutes").addResources(server, dbPool);

require("./lib/resources/results").addResources(server, dbPool);

require("./lib/resources/users").addResources(server, dbPool);

var maxAge = 0; // xxx during development
require("./lib/resources/static").addResources(server, clientRoot, maxAge);

function startServer(protocol, port) {
    auth.setTimeLimits(configuration.SessionMaxTime, configuration.SessionIdleTime);

    console.log("ClimbingComp " + protocol + " Server listening on port " + port);
    server.listen(port);
}
