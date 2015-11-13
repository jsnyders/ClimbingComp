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
var path = require('path');
var restify = require("restify");
var PDFdocument = require("pdfkit");
var pdfu = require("../pdfUtils");
var auth = require("../auth");
var conv = require("../conv");
var errors = require("../errors");
var csvLoader = require("../loadFromCSV");
var csvStringify = require("csv").stringify;

var InvalidInput = errors.InvalidInput;

// xxx support route_category
function loadRoutes(csvFile, haveLocation, haveColor, columns, next) {
    var routeColumns, lastRouteNumber,
        minInputCols = 2,
        maxCol = 0,
        routes = [],
        haveRowsAndColumns = true;

    function validateRoute(route, addError) {
        var n;
        // check and fix up data
        n = conv.convertToInteger(route.number);
        if (conv.isInvalid(n) || n <= 0) {
            addError("Bad route number");
        } else {
            route.number = n;
            if (lastRouteNumber && lastRouteNumber + 1 !== n) {
                addError("Nonconsecutive route number");
            }
            lastRouteNumber = n;
        }
        if (haveLocation) {
            route.location = route.location.trim();
            if (!route.location) {
                addError("Missing route location");
            }
        }
        if (haveColor) {
            route.color = route.color.trim();
            if (!route.color) {
                addError("Missing route color");
            }
        }
        n = conv.convertToInteger(route.points);
        if (conv.isInvalid(n) || n <= 0) {
            addError("Bad points");
        } else {
            route.points = n;
        }

        if (route.sheetRow !== "" && route.sheetColumn !== "") {
            route.sheetRow = parseInt(route.sheetRow, 10);
            route.sheetColumn = parseInt(route.sheetColumn, 10);
            if ( route.sheetColumn > maxCol ) {
                maxCol = route.sheetColumn;
            }
            if (isNaN(route.sheetRow) || isNaN(route.sheetColumn)) {
                addError("Bad route sheet row or column number");
            }
        } else {
            haveRowsAndColumns = false;
            route.sheetRow = null;
            route.sheetColumn = null;
        }
    }

    routeColumns = ["number"];
    if (haveLocation) {
        routeColumns.push("location");
        minInputCols += 1;
    }
    if (haveColor) {
        routeColumns.push("color");
        minInputCols += 1;
    }
    routeColumns.push("points");
    routeColumns.push("sheetRow");
    routeColumns.push("sheetColumn");

    csvLoader.loadFromCSV(csvFile, true, minInputCols, routeColumns, null, validateRoute, function(err, parsedRoutes) {
        var i, routes, error, errorMessages;

        if (!err) {
            maxCol += 1; // from max column index to column count
            if (haveRowsAndColumns && maxCol !== parseInt(columns,10)) {
                next(new InvalidInput("Expecting scorecard routes in " + columns + " columns, but input has " + maxCol + " columns."));
            } else {
                routes = [];
                for (i = 0; i < parsedRoutes.length; i++) {
                    routes.push(parsedRoutes[i].item);
                }
                next(null, routes, haveRowsAndColumns);
            }
        } else {
            if (err.name === "CSVDataError") {
                errorMessages = "";
                for (i = 0; i < err.errors.length; i++) {
                    error = err.errors[i];
                    errorMessages += "Line " + error.line + ". Error(s): " + error.errors.join(", ") + ".\n";
                }
                next(new InvalidInput(errorMessages));
            } else {
                return next(err);
            }
        }
    });
}

function setRoutes(conn, eventId, routes, version, round, next) {
    var i, route,
        insertRows = [];

    // xxx validation must have routes and version, routes must be an array
    for (i = 0; i < routes.length; i++) {
        route = routes[i];
        // xxx validate route
        insertRows.push(
            [ route.number, round, eventId, route.points, route.sheetRow, route.sheetColumn, route.location || null, route.color || null ]
        );
    }

    // update event version
    conn.query("UPDATE event SET version = ? WHERE id = ? AND version = ? AND ? <= num_rounds;", [version, eventId, version, round], function(err, result) {
        if (err) {
            return next(err);
        }

        if (result.affectedRows !== 1) {
            conn.query("SELECT id FROM event where id = ?", [eventId], function(err, rows) {
                if (!err) {
                    if (rows.length !== 1) {
                        err = new restify.ResourceNotFoundError("No such event");
                    } else {
                        err = new restify.ConflictError("Stale version or invalid round");
                    }
                }
                return next(err);
            });
            return;
        } // else

        // clear out old routes
        conn.query("DELETE FROM event_route WHERE event_id = ? AND round = ?;", [eventId, round], function(err /*, result*/) {
            if (err) {
                return next(err);
            }

            // insert new routes
            conn.query("INSERT INTO event_route " +
                "(number, round, event_id, points, sheet_row, sheet_column, location, color) VALUES ?", [insertRows], function(err /*, result*/) {

                if (err) {
                    return next(err);
                }

                return next();
            });
        });
    });

}

function printScoreCardPDF(res, event, clientRoot) {
    var i, columns, route, doc, x, y, pageWidth, colWidth, top, left, tableHeight, logo1, logo2, instructions,
        layout = event.scoreCardColumns > 2 ? "landscape" : "portrait",
        columnsRoutes = [];

    if (event.scoreCardImg1) {
        logo1 = path.join(clientRoot, "upload", event.scoreCardImg1);
    }
    if (event.scoreCardImg2) {
        logo2 = path.join(clientRoot, "upload", event.scoreCardImg2);
    }
    // xxx also need image size?

    instructions = event.scoreCardInstructions;

    doc = new PDFdocument({
        layout: layout,
        size: "letter",
        margins: {top: 36, right: 18, bottom: 36, left: 18}
    });
    doc.info = {
        Title: event.location + " - " + conv.formatDate(event.eventDate) + " - " + event.series,
        Subject: "Scorecard",
        Author: "ClimbinComp"
    };
    doc.pipe(res);

    columns = [];
    columns.push({label: "Route #", prop: "number", width: 30, align: "center"});
    if (event.routesHaveLocation) {
        columns.push({label: event.scoreCardLocationLabel || "Location", prop: "location", width: 50});
    }
    if (event.routesHaveColor) {
        columns.push({label: "Color", prop: "color", width: 50});
    }
    columns.push({label: "Points", prop: "points", width: 32, align: "right"});
    columns.push({label: "Falls", width: 40}); // blank so no prop
    columns.push({label: "Judges Initials", width: 55}); //blank so no prop

    pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    colWidth = pageWidth / event.scoreCardColumns;
    top = doc.y;
    left = doc.x;

    for (i = 0; i < event.scoreCardColumns; i++) {
        columnsRoutes.push([]);
    }
    // split routes into columns
    for (i = 0; i < event.routes.length; i++) {
        route = event.routes[i];
        columnsRoutes[route.sheetColumn].push(route);
    }

    // figure out available height above tables
    // estimate table height
    tableHeight = 18 * (1 + columnsRoutes[0].length); // xxx 18 is based on table font and font size for header and cells
    console.log("xxx table height " + tableHeight);
    
    try {
        // heading
        doc.font("Helvetica-Bold")
            .fontSize(16);
        doc.text("Scorecard - " + event.location + " - " + conv.formatDate(event.eventDate) + " - " + event.series, left + 8, top, {
            align: "center"
        });
        top = doc.y;
        doc.fontSize(10);
        doc.text("Bib#: _______\nName: ______________________\nCategory: _________ Gender: M / F\nBirth Year: ______", left + 8, top + 10 + 8, {
            width: 189 - 16,  // 2 5/8"
            height: 72 - 16   // 1"
        });
        doc.rect(left, top + 10, 189, 72).stroke();

        // xxx these image sizes are fudged currently
        if (logo1) {
            doc.image(logo1, pageWidth - 100, top, {width: 100});
        }

        if (logo2) {
            doc.image(logo2, pageWidth - 260, top, {width: 140});
        }

        top = doc.page.height - doc.page.margins.top - doc.page.margins.bottom - tableHeight;

        if (instructions) {
            doc.fontSize(8);
            doc.text(instructions, left + 8, top - 72 - 8, {
                width: pageWidth / 2 - 16,
                height: 72
            });
        }

        for (i = 0; i < event.scoreCardColumns; i++) {
            pdfu.printTable(doc, columns, columnsRoutes[i], left, top, {
                cellPaddingX: 4,
                cellPaddingY: 4,
                headerHeight: 32,
                headerAlign: "center",
                headerFontSize: 9,
                headerFill: "#ddd",
                headerColor: "#222",
                cellFontSize: 10,
                tableWidth: colWidth,
                cellBorderWidth: [1, 1],
                stripe: [{fill: "#eee"}, {fill: null}]
            });
            left += colWidth;
        }

        doc.end();
    } catch(ex) {
        console.log("xxx error creating PDF ", ex);
        doc.end();
    }
}

function addResources(server, dbPool, clientRoot) {
    var log = server.log;

    /*
     * Get routes for an event
     *
     * URI: data/events/<event-id>/routes?round=<n>[&<fmt=<csv|pdf|json>]
     * Method: GET
     * Role: Admin
     * Input: None
     * Output: Collection of routes
     */
    server.get("data/events/:eventId/routes", function(req,res,next) {
        var eventId = conv.convertToIntegerId(req.params.eventId),
            round = conv.convertToInteger(req.params.round),
            resultFormat = req.params.fmt || "json";

        if (!auth.validateAuthAndRole(auth.ROLE_ADMIN, req, next)) {
            return;
        }

        if (conv.isInvalid(eventId)) {
            return next(new restify.ResourceNotFoundError("Invalid event id"));
        }

        if (conv.isInvalid(round)) {
            return next(new restify.ResourceNotFoundError("Invalid round"));
        }

        dbPool.getConnection(function(err, conn) {
            if (err) {
                return next(err);
            }

            conn.query("SELECT id, version, location, event_date, series, score_card_columns, routes_have_location, routes_have_color, num_rounds, " +
                        "sc_location_label, sc_img_1, sc_img_2, sc_instructions " +
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
                if (round < 1 || round > row.num_rounds) {
                    return next(new restify.ResourceNotFoundError("No such round"));
                }
                event = {
                    eventId: row.id,
                    version: row.version,
                    location: row.location,
                    eventDate: row.event_date,
                    series: row.series,
                    routesHaveLocation: conv.fromDbBool(row.routes_have_location),
                    routesHaveColor: conv.fromDbBool(row.routes_have_color),
                    scoreCardColumns: row.score_card_columns,
                    scoreCardLocationLabel: row.sc_location_label,
                    scoreCardImg1: row.sc_img_1,
                    scoreCardImg2: row.sc_img_2,
                    scoreCardInstructions: row.sc_instructions,
                    routes: []
                };

                // xxx this is duplicated in events.js consider consolidating
                conn.query("SELECT number, color, location, points, sheet_row, sheet_column FROM event_route " +
                              "WHERE event_id = ? AND round = ? ORDER BY sheet_column, sheet_row;", [eventId,round], function(err, rows) {
                    var i, route, row, columns, csvWriter;

                    conn.release();
                    if (err) {
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
                    if (resultFormat === "csv") {
                        res.header("Content-Disposition", "attachment; filename=\"RoutesFor_" +
                            event.location.replace(/[\/: \t]/g, "_") + "_" + conv.formatDateForFilename(event.eventDate) + ".csv\"");
                        res.header("Content-Type", "application/csv");

                        csvWriter = csvStringify({
                            delimiter: ",",
                            escape: '"',
                            rowDelimiter: "windows"
                        });
                        csvWriter.pipe(res);
                        // header
                        columns = [];
                        columns.push("Route#");
                        if (event.routesHaveLocation) {
                            columns.push(event.scoreCardLocationLabel || "Location");
                        }
                        if (event.routesHaveColor) {
                            columns.push("Color");
                        }
                        columns.push("Points");
                        columns.push("Row");
                        columns.push("Column");
                        csvWriter.write(columns);

                        for (i = 0; i < event.routes.length; i++) {
                            route = event.routes[i];

                            columns = [];
                            columns.push(route.number);
                            if (event.routesHaveLocation) {
                                columns.push(route.location);
                            }
                            if (event.routesHaveColor) {
                                columns.push(route.color);
                            }
                            columns.push(route.points);
                            columns.push(route.sheetRow);
                            columns.push(route.sheetColumn);
                            csvWriter.write(columns);
                        }
                        csvWriter.end();
                    } else if (resultFormat === "pdf") {
                        res.header("Content-Type", "application/pdf");
                        printScoreCardPDF(res, event, clientRoot);
                        return next();
                    } else { // must be json
                        res.send(event);
                        return next();
                    }
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

     * URI: data/events/<event-id>/routes?round=<n>
     * Method: PUT
     * Role: Admin
     * Input: Collection of routes same as returned on get. Version must be set. Id is ignored
     * Output: xxx
     */
    server.put("data/events/:eventId/routes", function(req,res,next) {
        var eventId = conv.convertToIntegerId(req.params.eventId),
            round = conv.convertToInteger(req.params.round),
            input = req.body;

        if (!auth.validateAuthAndRole(auth.ROLE_ADMIN, req, next)) {
            return;
        }

        if (conv.isInvalid(eventId)) {
            return next(new restify.ResourceNotFoundError("Invalid event id"));
        }

        if (conv.isInvalid(round) || round < 1) {
            return next(new restify.ResourceNotFoundError("Invalid round"));
        }

        dbPool.getConnection(function(err, conn) {
            if (err) {
                return next(err);
            }
            setRoutes(conn, eventId, input.routes, input.version, round, function(err) {
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
     * URI: data/events/<event-id>/routes-upload?round=<n>
     * Method: POST
     * Role: Admin
     * Input: Collection of routes same as returned on get. Version must be set. Id is ignored
     * Output: xxx
     * // xxx https://developer.mozilla.org/en-US/docs/Web/Guide/Using_FormData_Objects
     */
    server.post("data/events/:eventId/routes-upload", function(req,res,next) {
        var csvFile,
            eventId = conv.convertToIntegerId(req.params.eventId),
            round = conv.convertToInteger(req.params.round),
            input = req.body;

        csvFile = req.files.file.path;

        if (!auth.validateAuthAndRole(auth.ROLE_ADMIN, req, next)) {
            return;
        }

        if (conv.isInvalid(eventId)) {
            return next(new restify.ResourceNotFoundError("Invalid event id"));
        }

        if (conv.isInvalid(round) || round < 1) {
            return next(new restify.ResourceNotFoundError("Invalid round"));
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
                setRoutes(conn, eventId, routes, input.version, round, function(err) {
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
