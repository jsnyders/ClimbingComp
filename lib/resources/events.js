/*
 events.js
 Resources related to events

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

/*
 * xxx todo
 */

var restify = require("restify");
var auth = require("../auth");
var conv = require("../conv");
var errors = require("../errors");
var validate = require("../../common/validation");

var InvalidInput = errors.InvalidInput;


function getEvent(conn, eventId, next) {
    var args,
        query = "SELECT id, version, region, location, event_date, series, state, sanctioning, score_card_columns, " +
        "current_round, num_rounds, round_1_num_routes, round_1_format, round_1_num_advance, " +
        "round_2_num_routes, round_2_format, round_2_num_advance, " +
        "round_3_num_routes, round_3_format, round_3_num_advance, bib_number_digits, " +
        "routes_have_location, routes_have_color, record_falls_per_climb, notes, updated_on, updated_by " +
        "FROM event "; 
    if (eventId) {
        query += "WHERE id = ?;";
        args = [eventId];
    } else {
        // get the default event
        query += "WHERE state = 'Internal' and location = 'DEFAULT';";
        args = [];
    }
    conn.query( query, args, function(err, rows) {
        var i, event, row, rounds, baseKey;

        conn.release();

        if (err) {
            return next(err, null);
        }

        if (rows.length !== 1) {
            return next(null, null);
        }

        row = rows[0];
        event = {
            eventId: row.id,
            version: row.version,
            region: row.region || "",
            location: row.location,
            date: new Date(row.event_date),
            series: row.series,
            state: row.state,
            currentRound: row.current_round,
            sanctioning: row.sanctioning,
            scoreCardColumns: row.score_card_columns,
            bibNumberDigits: row.bib_number_digits,
            recordFallsPerClimb: conv.fromDbBool(row.record_falls_per_climb),
            routesHaveLocation: conv.fromDbBool(row.routes_have_location),
            routesHaveColor: conv.fromDbBool(row.routes_have_color),
            notes: row.notes || "",
            updatedBy: row.updated_by,
            updatedOn: new Date(row.updated_on)
        };
        rounds = [];
        for (i = 0; i < row.num_rounds; i++) {
            baseKey = "round_" + (i + 1);
            rounds.push({
                format: row[baseKey + "_format"],
                numRoutes: row[baseKey + "_num_routes"],
                numAdvance: row[baseKey + "_num_advance"]
            });
        }
        event.rounds = rounds;
        return next(err, event);
    });
}

function validateEventInput(input) {
    var reason;
    input.region = (input.region || "").trim();
    if (input.region === "") {
        input.region = null;
    } else {
        reason = validate.stringLength("region", input.region, 100);
        if (reason) {
            return new InvalidInput(reason);
        }
    }
    input.location = input.location.trim();
    reason = validate.requiredStringLength("location", input.location, 200);
    if (reason) {
        return new InvalidInput(reason);
    }
    reason = validate.stringInSet("series", input.series, ["SCS", "ABS", "CCS", "Other"]); // todo generalize this xxx these need to come from DB configuration
    if (reason) {
        return new InvalidInput(reason);
    }
    reason = validate.stringInSet("sanctioning", input.sanctioning, ["Local", "Regional", "Divisional", "National", "None"]);  // todo generalize this
    if (reason) {
        return new InvalidInput(reason);
    }

//xxx        event_date: new Date(input.date), // xxx date conversion needs work

    /*xxx this needs to be done for each round
    reason = validate.stringInSet("format", input.type, ["Red Point"]); // xxx todo support more types
    if (reason) {
        return new InvalidInput(reason);
    }
    */

    reason = validate.stringInSet("state", input.state, ["Open", "Active", "Preliminary", "Closed"]);
    if (reason) {
        return new InvalidInput(reason);
    }
    //xxx
    // currentRound
    // bibNumberDigits 3 or 4
    // rounds array
    // score_card_columns must be a number 1,2,3,4
//        record_falls_per_climb: toDbBool(input.recordFallsPerClimb),
//        routes_have_location: toDbBool(input.routesHaveLocation),
//        routes_have_color: toDbBool(input.routesHaveColor),

    input.notes = (input.notes || "").trim();
    if (input.notes === "") {
        input.notes = null;
    } else {
        reason = validate.stringLength("notes", input.notes, 100);
        if (reason) {
            return new InvalidInput(reason);
        }
    }

    return null; // valid
}

function makeEvent(input) {
    var i, row, baseKey;

    row =  {
        region: input.region,
        location: input.location,
        event_date: new Date(input.date), // xxx
        series: input.series,
        state: input.state,
        current_round: input.currentRound,
        sanctioning: input.sanctioning,
        score_card_columns: input.scoreCardColumns,
        bib_number_digits: input.bibNumberDigits,
        num_rounds: input.rounds.length,
        record_falls_per_climb: conv.toDbBool(input.recordFallsPerClimb),
        routes_have_location: conv.toDbBool(input.routesHaveLocation),
        routes_have_color: conv.toDbBool(input.routesHaveColor),
        notes: input.notes
    };
    for (i = 0; i < input.rounds.length; i++) {
        baseKey = "round_" + (i + 1);
        row[baseKey + "_format"] = input.rounds[i].format;
        row[baseKey + "_num_routes"] = input.rounds[i].numRoutes;
        row[baseKey + "_num_advance"] = input.rounds[i].numAdvance;
    }
    return row;
}

function addResources(server, dbPool) {
    var log = server.log;

    /*
     * List events
     *
     * URI: data/events[?state=all|running]
     * Method: GET
     * Role: Reader
     * Input: None
     * Output: Collection of event objects; just the most important properties
     *
     * xxx consider returning the number of climbers and number of routes
     */
    server.get("data/events", function(req,res,next) {
        var query = "SELECT id, region, location, event_date, series, sanctioning, state, updated_by, updated_on, version " +
            "FROM event";

        if (!auth.validateAuthAndRole(auth.ROLE_READER, req, next)) {
            return;
        }

        if ( req.params.state === "all" ) {
            query += " WHERE state != 'Internal';";
        } else if ( req.params.state === "running" ) {
            query += " WHERE state = 'Active' OR state = 'Preliminary';";
        } else {
            query += " WHERE state != 'Internal';";
        }

        dbPool.getConnection(function(err, conn) {
            if (err) {
                return next(err);
            }
            conn.query(query, function(err, rows) {
                var i, event, row,
                    events = [];

                conn.release();
                if (err) {
                    return next(err);
                }

                for (i = 0; i < rows.length; i++) {
                    row = rows[i];
                    event = {
                        eventId: row.id,
                        region: row.region || "",
                        location: row.location,
                        date: new Date(row.event_date),
                        series: row.series,
                        sanctioning: row.sanctioning,
                        state: row.state,
                        currentRound: row.current_round,
                        updatedBy: row.updated_by,
                        updatedOn: row.updated_on,
                        version: row.version
                    };
                    events.push(event);
                }
                res.send({items: events});
                return next();
            });
        });
    });

    /*
     * Create event
     *
     * URI: data/events
     * Method: POST
     * Role: ADMIN
     * Input: Event object to create
     * Output: Event object created
     * Returns event object with the same information as the input with the addition of eventId property
     * Response includes a Location header with the URI of the resource created
     */
    server.post("data/events", function(req,res,next) {
        var event, e,
            input = req.body;

        if (!auth.validateAuthAndRole(auth.ROLE_ADMIN, req, next)) {
            return;
        }

        e = validateEventInput(input);
        if ( e ) {
            return next(e);
        }

        event = makeEvent(input);

        dbPool.getConnection(function(err, conn) {
            if (err) {
                return next(err);
            }

            conn.query("INSERT INTO event SET updated_on = NOW(), updated_by = ?, ?;", [req.authInfo.username, event], function(err, result) {
                var eventId;

                if (err) {
                    conn.release();
                    return next(err);
                }
                eventId = result.insertId;
                req.log.debug("Added event \"" + event.location + "\" on " + event.event_date + ". Event ID=" + eventId);

                getEvent(conn, eventId, function(err, event) {
                    conn.release();
                    if (err) {
                        return next(err);
                    }
                    if (!event) {
                        return next(new restify.InternalError("Not created"));
                    }
                    res.header("Location", "/data/events/" + eventId);
                    res.send(event);
                    return next();
                });

            });

        });

    });

    /*
     * Get event
     *
     * URI: data/events/<event-id>
     * Method: GET
     * Role: Reader
     * Input: None
     * Output: Event object. Includes version and notes
     */
    server.get("data/events/:eventId", function(req,res,next) {
        var eventId = conv.convertToIntegerId(req.params.eventId);

        if (!auth.validateAuthAndRole(auth.ROLE_READER, req, next)) {
            return;
        }

        if (conv.isInvalid(eventId)) {
            return next(new restify.ResourceNotFoundError("Invalid event id"));
        }

        dbPool.getConnection(function(err, conn) {
            if (err) {
                return next(err);
            }
            getEvent(conn, eventId, function(err, event) {
                conn.release();
                if (err) {
                    return next(err);
                }
                if (!event) {
                    return next(new restify.ResourceNotFoundError("No such event"));
                }
                res.send(event);
                return next();
            });
        });
    });

    /*
     * Get create event defaults
     *
     * URI: data/events-create-defaults
     * Method: GET
     * Role: Admin
     * Input: None
     * Output: Default event object.
     */
    server.get("data/events-create-defaults", function(req,res,next) {
        if (!auth.validateAuthAndRole(auth.ROLE_ADMIN, req, next)) {
            return;
        }

        dbPool.getConnection(function(err, conn) {
            if (err) {
                return next(err);
            }
            getEvent(conn, null, function(err, event) {
                event.date = null;
                event.location = "";
                conn.release();
                if (err) {
                    return next(err);
                }
                if (!event) {
                    return next(new restify.ResourceNotFoundError("No such event"));
                }
                res.send(event);
                return next();
            });
        });
    });

    /*
     * Update event
     *
     * URI: data/events/<event-id>
     * Method: PUT
     * Role: Admin
     * Input: Event object. Must include version.
     * Output: Event object updated.
     */
    server.put("data/events/:eventId", function(req,res,next) {
        var event, e,
            eventId = conv.convertToIntegerId(req.params.eventId),
            input = req.body;

        if (!auth.validateAuthAndRole(auth.ROLE_ADMIN, req, next)) {
            return;
        }

        if (conv.isInvalid(eventId)) {
            return next(new restify.ResourceNotFoundError("Invalid event id"));
        }

        e = validateEventInput(input);
        if ( e ) {
            return next(e);
        }

        event = makeEvent(input);

        dbPool.getConnection(function(err, conn) {
            if (err) {
                return next(err);
            }

            // A trigger updates the version
            conn.query("UPDATE event SET updated_on = NOW(), updated_by = ?, ? WHERE id = ? AND version = ?;",
                        [req.authInfo.username, event, eventId, input.version], function(err, result) {
                if (err) {
                    conn.release();
                    return next(err);
                }

                if (result.affectedRows !== 1) {
                    conn.query("SELECT id FROM event WHERE id = ?", eventId, function(err, rows) {
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
                } else {
                    getEvent(conn, eventId, function(err, event) {
                        conn.release();
                        if (err) {
                            return next(err);
                        }
                        if (!event) {
                            return next(new restify.InternalError("Not found after update"));
                        }
                        res.send(event);
                        return next();
                    });
                }

            });

        });

    });

    /*
     * Delete event
     *
     * URI: data/events/<event-id>
     * Method: DELETE
     * Role: Admin
     * Input: none, version parameter required
     * Output: none
     */
    server.del("data/events/:eventId", function(req,res,next) {
        var eventId = conv.convertToIntegerId(req.params.eventId),
            version = req.params.version;

        if (!auth.validateAuthAndRole(auth.ROLE_ADMIN, req, next)) {
            return;
        }

        if (conv.isInvalid(eventId)) {
            return next(new restify.ResourceNotFoundError("Invalid event id"));
        }
        if (!version) {
            return next(new restify.ResourceNotFoundError("Version param required"));
        }

        dbPool.getConnection(function(err, conn) {
            if (err) {
                return next(err);
            }

            conn.query("DELETE FROM event WHERE id = ? AND version = ?;", [eventId, version], function(err, result) {
                if (err) {
                    conn.release();
                    return next(err);
                }
                if (result.affectedRows !== 1) {
                    conn.query("SELECT id FROM event where id = ?", eventId, function(err, rows) {
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
                } else {
                    // delete routes and climbers but don't wait
                    conn.query("DELETE FROM event_route WHERE event_id = ?;", [eventId], function(err, result) {
                        if (err) {
                            conn.release();
                            log.error("Failed to delete routes for event " + eventId + ". Reason: " + err.message);
                            return;
                        }
                        conn.query("DELETE FROM event_climber WHERE event_id = ?;", [eventId], function(err, result) {
                            if (err) {
                                conn.release();
                                log.error("Failed to delete climbers for event " + eventId + ". Reason: " + err.message);
                            }
                        });
                    });
                    res.send(204,"No Content");
                }
            });
        });
    });

    /*
     * Get all data for an event
     *
     * URI: data/events/<event-id>/data
     * Method: GET
     * Role: Reader
     * Input: None
     * Output: Event object with sub collections of routes and climbers
     */
    server.get("data/events/:eventId/data", function(req,res,next) {
        var eventId = conv.convertToIntegerId(req.params.eventId);

        if (!auth.validateAuthAndRole(auth.ROLE_READER, req, next)) {
            return;
        }

        if (conv.isInvalid(eventId)) {
            return next(new restify.ResourceNotFoundError("Invalid event id"));
        }

        dbPool.getConnection(function(err, conn) {
            if (err) {
                return next(err);
            }
            getEvent(conn, eventId, function(err, event) {
                var thisRound;
                if (err) {
                    conn.release();
                    return next(err);
                }

                if (!event) {
                    return next(new restify.ResourceNotFoundError("No such event"));
                }
                event.routes = [];
                event.climbers = [];
                if ( !event.currentRound || event.currentRound < 1 || event.currentRound > event.rounds.length ) {
                    event.currentRound = 1;
                }
                thisRound = event.rounds[event.currentRound - 1];

                conn.query("SELECT number, color, location, points, sheet_row, sheet_column FROM event_route " +
                            "WHERE event_id = ? AND round = ? ORDER BY sheet_column, sheet_row;", [eventId, event.currentRound], function(err, rows) {
                    var i, route, row, query, routeOffset, routes, firstRoute;

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
                            sheetColumn: row.sheet_column
                        };
                        if (event.routesHaveLocation) {
                            route.location = row.location;
                        }
                        if (event.routesHaveColor) {
                            route.color = row.color;
                        }
                        event.routes.push(route);
                    }

                    routeOffset = 0;
                    for (i = 0; i < event.currentRound - 1; i++) {
                        routeOffset += event.rounds[i].numRoutes;
                    }
                    routes = "";
                    firstRoute = "route_" + (routeOffset + 1) + "_score";
                    for (i = 0; i < thisRound.numRoutes; i++) {
                        routes += ", ec.route_" + (routeOffset + i + 1) + "_score";
                    }
                    query = "SELECT ec.bib_number, ec.version, c.usac_member_id, c.first_name, c.last_name, c.gender, ec.category, ec.region, ec.team" +
                        routes + ",total_falls, final_time, climbs, ec.scored_on, ec.scored_by " +
                        "FROM event_climber ec, climber c WHERE ec.climber_id = c.id AND ec.event_id = ?;";

                    conn.query(query, [eventId], function(err, rows) {

                        var i, climber, row;

                        conn.release();
                        if (err) {
                            return next(err);
                        }

                        for (i = 0; i < rows.length; i++) {
                            row = rows[i];
                            climber = {
                                bibNumber: row.bib_number,
                                version: row.version,
                                usacMemberId: row.usac_member_id, // xxx should this be a string
                                firstName: row.first_name,
                                lastName: row.last_name,
                                gender: row.gender,
                                category: row.category,
                                region: row.region,
                                team: row.team,
                                scoredOn: row.scored_on, // xxx date
                                scoredBy: row.scored_by
                            };
                            // xxx maybe don't need this in this request but in a different one
                            if (row.total_falls !== null || row[firstRoute] !== null || row.climbs !== null) {
                                climber.scoreCard = {
                                    totalFalls: row.total_falls,
                                    finalTime: row.final_time,
                                    climbs: JSON.parse(row.climbs)
                                };
                                for (i = 0; i < thisRound.numRoutes; i++) {
                                    // xxx consider rename top<n> to route<n>
                                    climber.scoreCard["top" + (i + 1)] = row["route_" + (routeOffset + i + 1) + "_score"];
                                }
                            }
                            event.climbers.push(climber);
                        }
                        res.send(event);
                        return next();
                    });
                });
            });
        });
    });

}

module.exports = {
    addResources: addResources
};
