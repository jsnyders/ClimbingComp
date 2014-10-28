/**
 * loadEventRoutes.js
 * Utility program to load Climbing Comp database with routes for an event from a csv file
 * Copyright (c) 2014, John Snyders
 */
/* jshint node: true, strict: false */

var csv = require('csv');
var db = require('mysql');

// xxx get this from config
var dbDatabase = "climbing_comp",
    dbUser = "john",
    dbPassword = "john";

var dbConnection;

var args = process.argv.slice(2),
    eventId = null,
    csvFile = null;

function usage() {
    console.log("Usage:");
    console.log("  node loadEventRoutes.js event-id csv-file");
    console.log("  node loadEventRoutes.js help | -h");
    console.log("");
    console.log("CSV format:");
    console.log("  number, location and/or color, points [, row , column]");
    console.log("  First line assumed to contain column headings and ignored. Extra columns ignored.");
    console.log("  CSV file must contain all routes as any existing routes are overwritten.");
}

function clear(eventId, next) {
    console.log("Info: Clear previous routes.");
    dbConnection.query("DELETE FROM event_route WHERE event_id = ?;", eventId, function(err, result) {
        if (err) {
            throw err;
        }
        next();
    });
}

function insert(route) {
    dbConnection.query("INSERT INTO event_route SET ?;", route, function(err, result) {
        if (err) {
            throw err;
        }
    });
}

if (args.length >= 1 && (args[0] === "help" || args[0] === "-h")) {
    usage();
    process.exit();
}

if (args.length !== 2) {
    console.log("Missing required arguments");
    usage();
    process.exit();
}

eventId = parseInt(args[0], 10);
csvFile = args[1];

if (isNaN(eventId)) {
    console.log("Invalid event-id. Must be a number.");
    usage();
    process.exit();
}

dbConnection = db.createConnection({
    host: 'localhost',
    user: dbUser,
    password: dbPassword,
    database: dbDatabase
});

dbConnection.connect();

dbConnection.query("SELECT id,routes_have_location,routes_have_color,location FROM event WHERE id = ?;", eventId, function(err, rows) {
    if (err) {
        throw err;
    }
    if (rows.length === 1) {
        console.log("Found event " + rows[0].id + " at " + rows[0].location );
        loadRoutes(rows[0].routes_have_location, rows[0].routes_have_color, processRoutes);
    } else {
        dbConnection.end();
        console.log("Event with event-id " + eventId + " not found.");
        usage();
        process.exit();

    }
});

function loadRoutes(haveLocation, haveColor, next) {
    var routes = [],
        error = false,
        haveRowsAndColumns = true;

    function logError(message) {
        console.log(message);
        error = true;
    }

    csv()
        .from.path(csvFile, { delimiter: ',', escape: '"' })
        .transform(function(row, index) {
            if (index === 0) {
                return null;
            }
            return row;
        })
        .on('record', function(row, index) {
            var route,col;

            if (row.length < 3) {
                logError("Too few columns on line " + index);
                return;
            }
            // number, color/location, points [, row , column]
            route = {
                number: parseInt(row[0], 10),
                event_id: eventId
            };
            col = 1;
            if (haveLocation) {
                route.location = row[col];
                col += 1;
            }
            if (haveColor) {
                route.color = row[col];
                col += 1;
            }
            if ( row.length <= col ) {
                logError("Too few columns on line " + index);
            }
            route.points = parseInt(row[col], 10);
            col += 1;

            if ( row.length >= col + 2 ) {
                route.sheet_row = parseInt(row[col], 10);
                col += 1;
                route.sheet_column = parseInt(row[col], 10);
            } else {
                haveRowsAndColumns = false;
            }

            if (haveLocation && route.location === undefined) {
                logError("Missing route location on line " + index);
            }
            if (haveColor && route.color === undefined) {
                logError("Missing route color on line " + index);
            }
            if (isNaN(route.number)) {
                logError("Bad route number on line " + index);
            }
            if (isNaN(route.points)) {
                logError("Bad points on line " + index);
            }
            if (route.sheet_row !== undefined && isNaN(route.sheet_row) ||
                route.sheet_column !== undefined && isNaN(route.sheet_column)) {
                logError("Bad route sheet row or column number on line " + index);
            }
            routes.push(route);
        })
        .on('end', function(/*count*/) {
            if (!error) {
                next(routes, haveRowsAndColumns);
            } else {
                dbConnection.end();
            }
        })
        .on('error', function(error) {
            console.log("Error processing CSV input: " + error.message);
            dbConnection.end();
        });
}

function processRoutes(routes, haveRowsAndColumns) {
    var i, route, row, col;

    if (routes.length === 0) {
        console.log("Error no routes to add");
        dbConnection.end();
        return;
    }

    if (!haveRowsAndColumns) {
        // sort by points
// xxx sorting should be an option for when this program prints the score cards
//        routes.sort(function(a,b) {
//            var result = b.points - a.points;
//            if (result === 0) {
//                result = a.number - b.number;
//            }
//            return result;
//        });
        row = 0;
        col = 0;
        for (i = 0; i < routes.length; i++) {
            route = routes[i];
            route.sheet_row = row;
            route.sheet_column = col;
            row += 1;
            if (row >= routes.length / 2) {
                col += 1;
                row = 0;
            }
        }
    }
    clear(routes[0].event_id, function() {
        for (i = 0; i < routes.length; i++) {
            route = routes[i];
//            console.log("xxx route: " + route.number + ", " + route.color + ", " + route.points + ", " + route.sheet_row + ", " + route.sheet_column );
            insert(route);
        }
        console.log("Info: Loaded " + routes.length + " routes");

        dbConnection.end();
    });
}
