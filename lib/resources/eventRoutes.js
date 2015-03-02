/*
 eventRoutes.js
 Resources related to event routes

 Copyright (c) 2014, 2015, John Snyders

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

var fs = require('fs');
var restify = require("restify");
var auth = require("../auth");
var conv = require("../conv");
var errors = require("../errors");
var validate = require("../../common/validation");
var csv = require('csv');

// xxx switch to csvLoader.loadFromCSV
function loadRoutes(csvFile, haveLocation, haveColor, columns, next) {
    var maxCol = 0,
        routes = [],
        error = false,
        errorMessages = "",
        haveRowsAndColumns = true;

    function logError(message) {
        errorMessages += message + "\n";
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
                location: null,
                color: null
            };
            col = 1;
            if (haveLocation) {
                route.location = row[col].trim();
                col += 1;
            }
            if (haveColor) {
                route.color = row[col].trim();
                col += 1;
            }
            if ( row.length <= col ) {
                logError("Too few columns on line " + index);
                return;
            }
            route.points = parseInt(row[col], 10);
            col += 1;

            if ( row.length >= col + 2 ) {
                route.sheetRow = parseInt(row[col], 10);
                col += 1;
                route.sheetColumn = parseInt(row[col], 10);
                if ( route.sheetColumn > maxCol ) {
                    maxCol = route.sheetColumn;
                }
            } else {
                haveRowsAndColumns = false;
            }

            if (haveLocation && !route.location) {
                logError("Missing route location on line " + index);
            }
            if (haveColor && !route.color) {
                logError("Missing route color on line " + index);
            }
            if (isNaN(route.number) || route.number <= 0) {
                logError("Bad route number on line " + index);
            }
            if (isNaN(route.points) || route.points <= 0) {
                logError("Bad points on line " + index);
            }
            if (route.sheet_row !== undefined && isNaN(route.sheet_row) ||
                route.sheet_column !== undefined && isNaN(route.sheet_column)) {
                logError("Bad route sheet row or column number on line " + index);
            }
            routes.push(route);
        })
        .on('end', function(/*count*/) {
            maxCol += 1; // from max column index to column count
            if (haveRowsAndColumns && maxCol !== parseInt(columns,10)) {
                logError("Expecting score card routes in " + columns + " columns, but input has " + maxCol + " columns.");
            }
            if (!error) {
                next(null, routes, haveRowsAndColumns);
            } else {
                next(new Error(errorMessages));
            }
        })
        .on('error', function(err) {
            logError("Error processing CSV input: " + err.message);
            next(err);
        });
}

function setRoutes(conn, eventId, routes, version, next) {
    var i, route,
        insertRows = [];

    // xxx validation must have routes and version routes must be an array
    for (i = 0; i < routes.length; i++) {
        route = routes[i];
        // xxx validate route
        insertRows.push(
            [ route.number, eventId, route.points, route.sheetRow, route.sheetColumn, route.location || null, route.color || null ]
        );
    }

    // update event version
    conn.query("UPDATE event SET version = ? WHERE id = ? AND version = ?;", [version, eventId, version], function(err, result) {
        if (err) {
            conn.release();
            return next(err);
        }

        if (result.affectedRows !== 1) {
            conn.query("SELECT id FROM event where id = ?", [eventId], function(err, rows) {
                conn.release();
                if (!err) {
                    if (rows.length !== 1) {
                        err = new restify.ResourceNotFoundError("No such event");
                    } else {
                        err = new restify.ConflictError("Stale version");
                    }
                }
                return next(err);
            });
            return;
        } // else

        // clear out old routes
        conn.query("DELETE FROM event_route WHERE event_id = ?;", [eventId], function(err /*, result*/) {
            if (err) {
                conn.release();
                return next(err);
            }

            // insert new routes
            conn.query("INSERT INTO event_route " +
                "(number, event_id, points, sheet_row, sheet_column, location, color) VALUES ?", [insertRows], function(err /*, result*/) {

                if (err) {
                    conn.release();
                    return next(err);
                }

                return next();
            });
        });
    });

}

function addResources(server, dbPool) {
    var log = server.log;

    /*
     * Get routes for an event
     *
     * URI: data/events/<event-id>/routes
     * Method: GET
     * Role: Admin
     * Input: None
     * Output: Collection of routes
     */
    server.get("data/events/:eventId/routes", function(req,res,next) {
        var eventId = conv.convertToIntegerId(req.params.eventId);

        if (!auth.validateAuthAndRole(auth.ROLE_ADMIN, req, next)) {
            return;
        }

        if (conv.isInvalid(eventId)) {
            return next(new restify.ResourceNotFoundError("Invalid event id"));
        }

        dbPool.getConnection(function(err, conn) {
            if (err) {
                return next(err);
            }

            conn.query("SELECT id, version, routes_have_location, routes_have_color " +
                "FROM event WHERE id = ?;", [eventId], function(err, rows) {
                var event, row;

                if (err) {
                    conn.release();
                    return next(err);
                }
                if (rows.length !== 1) {
                    res.send(404, "Not Found");
                    return next();
                }
                row = rows[0];
                event = {
                    eventId: row.id,
                    version: row.version,
                    routesHaveLocation: conv.fromDbBool(row.routes_have_location),
                    routesHaveColor: conv.fromDbBool(row.routes_have_color),
                    routes: []
                };

                // xxx this is duplicated in events.js consider consolidating
                conn.query("SELECT number, color, location, points, sheet_row, sheet_column FROM event_route WHERE event_id = ? ORDER BY sheet_column, sheet_row;", [eventId], function(err, rows) {
                    var i, route, row;

                    if (err) {
                        conn.release();
                        return next(err);
                    }

                    for (i = 0; i < rows.length; i++) {
                        row = rows[i];
                        route = {
                            number: row.number,
                            points: row.points,
                            sheetRow: row.sheet_row,
                            sheetColumn: row.sheet_column,
                            location: row.location,
                            color: row.color
                        };
                        event.routes.push(route);
                    }
                    res.send(event);
                    return next();

                });
            });
        });
    });

    /*
     * Update/Set routes for an event
     *

     number INTEGER(3) NOT NULL,
     event_id INTEGER NOT NULL,
     color VARCHAR(20),
     location VARCHAR(20),
     points INTEGER NOT NULL,
     sheet_row INTEGER,
     sheet_column INTEGER,

     * URI: data/events/<event-id>/routes
     * Method: PUT
     * Role: Admin
     * Input: Collection of routes same as returned on get. Version must be set. Id is ignored
     * Output: xxx
     */
    server.put("data/events/:eventId/routes", function(req,res,next) {
        var eventId = conv.convertToIntegerId(req.params.eventId),
            input = req.body;

        if (!auth.validateAuthAndRole(auth.ROLE_ADMIN, req, next)) {
            return;
        }

        if (conv.isInvalid(eventId)) {
            return next(new restify.ResourceNotFoundError("Invalid event id"));
        }

        dbPool.getConnection(function(err, conn) {
            if (err) {
                return next(err);
            }
            setRoutes(conn, eventId, input.routes, input.version, function(err) {
                conn.release();
                if (err) {
                    return next(err);
                }

                res.send({status: "OK"}); // xxx
                next();
            });
        });
    });


    /*
     * Update/Set routes for an event with route data coming from an uploaded file
     * Note this is a
     * URI: data/events/<event-id>/routes-upload
     * Method: POST
     * Role: Admin
     * Input: Collection of routes same as returned on get. Version must be set. Id is ignored
     * Output: xxx
     * // xxx https://developer.mozilla.org/en-US/docs/Web/Guide/Using_FormData_Objects
     */
    server.post("data/events/:eventId/routes-upload", function(req,res,next) {
        var csvFile,
            eventId = conv.convertToIntegerId(req.params.eventId),
            input = req.body;

        csvFile = req.files.file.path;
        console.log("xxx routes upload ", csvFile, req.files.file.name );

        if (!auth.validateAuthAndRole(auth.ROLE_ADMIN, req, next)) {
            return;
        }

        if (conv.isInvalid(eventId)) {
            return next(new restify.ResourceNotFoundError("Invalid event id"));
        }

        // the request is not in json format so do some conversions
        input.routesHaveLocation = conv.convertToBool(input.routesHaveLocation);
        input.routesHaveColor = conv.convertToBool(input.routesHaveColor);
        input.scoreCardColumns = conv.convertToInteger(input.scoreCardColumns);
        input.version = conv.convertToInteger(input.version);

        // xxx verify version?, has routesHaveLocation, routesHaveColor, scoreCardColumns, file path

        loadRoutes(csvFile, input.routesHaveLocation, input.routesHaveColor, input.scoreCardColumns, function(err, routes, haveRowsAndColumns) {
            var i, row, col, route, colCount;

            // delete file don't wait
            fs.unlink(csvFile, function (err) {
                if (err) {
                    log.error("Failed to delete file '" + csvFile + "'. Reason: " + err.message);
                }
            });

            // xxx review how errors are reported. Seems to be returning 500 internal error which doesn't seem right.

            if (err) {
                return next(err);
            }

            if (!haveRowsAndColumns) {
                row = 0;
                col = 0;
                colCount = Math.ceil(routes.length / input.scoreCardColumns);
                for (i = 0; i < routes.length; i++) {
                    route = routes[i];
                    route.sheetRow = row;
                    route.sheetColumn = col;
                    row += 1;
                    if (row >= colCount) {
                        col += 1;
                        row = 0;
                    }
                }
            }

            dbPool.getConnection(function(err, conn) {
                if (err) {
                    return next(err);
                }
                setRoutes(conn, eventId, routes, input.version, function(err) {
                    conn.release();
                    if (err) {
                        return next(err);
                    }

                    res.send({status: "OK"}); // xxx
                    next();
                });
            });

        });
    });

}

module.exports = {
    addResources: addResources
};
