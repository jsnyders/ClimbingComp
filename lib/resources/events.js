/*
 events.js
 Resources related to events

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
 * xxx todo
 */

var restify = require("restify");
var auth = require("../auth");
var conv = require("../conv");
var errors = require("../errors");
var validate = require("../../common/validation");

var InvalidInput = errors.InvalidInput;


function getEvent(conn, eventId, next) {
    conn.query("SELECT id, version, region, location, event_date, series, type, state, sanctioning, score_card_columns, " +
                    "routes_have_location, routes_have_color, record_falls_per_climb, notes, updated_on, updated_by " +
        "FROM event " +
        "WHERE id = ?;", [eventId], function(err, rows) {
        var event, row;

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
            type: row.type,
            state: row.state,
            sanctioning: row.sanctioning,
            scoreCardColumns: row.score_card_columns,
            recordFallsPerClimb: conv.fromDbBool(row.record_falls_per_climb),
            routesHaveLocation: conv.fromDbBool(row.routes_have_location),
            routesHaveColor: conv.fromDbBool(row.routes_have_color),
            notes: row.notes || "",
            updatedBy: row.updated_by,
            updatedOn: new Date(row.updated_on)
        };
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
    reason = validate.stringInSet("series", input.series, ["SCS", "ABS", "CCS", "Other"]);
    if (reason) {
        return new InvalidInput(reason);
    }
    reason = validate.stringInSet("sanctioning", input.sanctioning, ["Local", "Regional", "Divisional", "National", "None"]);
    if (reason) {
        return new InvalidInput(reason);
    }

//xxx        event_date: new Date(input.date), // xxx date conversion needs work

    reason = validate.stringInSet("type", input.type, ["Red Point"]); // xxx todo support more types
    if (reason) {
        return new InvalidInput(reason);
    }

    reason = validate.stringInSet("state", input.state, ["Open", "Active", "Preliminary", "Closed"]);
    if (reason) {
        return new InvalidInput(reason);
    }
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
    return {
        region: input.region,
        location: input.location,
        event_date: new Date(input.date), // xxx
        series: input.series,
        type: input.type,
        state: input.state,
        sanctioning: input.sanctioning,
        score_card_columns: input.scoreCardColumns,
        record_falls_per_climb: conv.toDbBool(input.recordFallsPerClimb),
        routes_have_location: conv.toDbBool(input.routesHaveLocation),
        routes_have_color: conv.toDbBool(input.routesHaveColor),
        notes: input.notes
    };
}

function addResources(server, dbPool) {
    var log = server.log;

    /*
     * List events
     *
     * URI: data/events
     * Method: GET
     * Role: Reader
     * Input: None
     * Output: Collection of event objects; just the most important properties
     *
     * xxx consider returning the number of climbers and number of routes
     * xxx filter options such as state=open
     */
    server.get("data/events", function(req,res,next) {

        if (!auth.validateAuthAndRole(auth.ROLE_READER, req, next)) {
            return;
        }

        dbPool.getConnection(function(err, conn) {
            if (err) {
                return next(err);
            }
            conn.query("SELECT id, region, location, event_date, series, type, sanctioning, state, updated_by, updated_on, version " +
                "FROM event;", function(err, rows) {
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
                        type: row.type,
                        sanctioning: row.sanctioning,
                        state: row.state,
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
     * Response includes a Location header with the
     */
    server.post("data/events", function(req,res,next) {
        var event,
            input = req.body;

        if (!auth.validateAuthAndRole(auth.ROLE_ADMIN, req, next)) {
            return;
        }

        var e = validateEventInput(input);
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
     * Update event
     *
     * URI: data/events/<event-id>
     * Method: PUT
     * Role: Admin
     * Input: Event object. Must include version.
     * Output: Event object updated.
     */
    server.put("data/events/:eventId", function(req,res,next) {
        var eventId = conv.convertToIntegerId(req.params.eventId),
            input = req.body,
            event;

        if (!auth.validateAuthAndRole(auth.ROLE_ADMIN, req, next)) {
            return;
        }

        var e = validateEventInput(input);
        if ( e ) {
            return next(e);
        }

        event = makeEvent(input);

        dbPool.getConnection(function(err, conn) {
            if (err) {
                return next(err);
            }

            // A trigger updates the version
            conn.query("UPDATE event SET updated_on = NOW(), updated_by = ?, ? WHERE id=? AND version=?;",
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
            conn.query("SELECT id, region, location, event_date, series, type, sanctioning, routes_have_location,routes_have_color,record_falls_per_climb " +
                "FROM event WHERE id = ?;", [eventId], function(err, rows) {
                var event, row;

                if (err) {
                    conn.release();
                    return next(err);
                }

                if (rows.length !== 1) {
                    return next(new restify.ResourceNotFoundError("No such event"));
                }
                row = rows[0];
                event = {
                    eventId: row.id,
                    region: row.region,
                    location: row.location,
                    date: new Date(row.event_date),
                    series: row.series,
                    type: row.type,
                    sanctioning: row.sanctioning,
                    "recordFallsPerClimb": conv.fromDbBool(row.record_falls_per_climb),
                    "routesHaveLocation": conv.fromDbBool(row.routes_have_location),
                    "routesHaveColor": conv.fromDbBool(row.routes_have_color),
                    routes: [],
                    climbers: []
                };

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

                    conn.query("SELECT number, usac_member_id, first_name, last_name, gender, category, region, team, total, top1, top2, top3, top4, top5, total_falls, climbs " +
                        "FROM event_climber ec, climber c WHERE ec.climber_id = c.id AND ec.event_id = ?;", [eventId], function(err, rows) {

                        var i, climber, row;

                        conn.release();
                        if (err) {
                            return next(err);
                        }

                        for (i = 0; i < rows.length; i++) {
                            row = rows[i];
                            climber = {
                                climberId: row.number,
                                usacMemberId: row.usac_member_id,
                                firstName: row.first_name,
                                lastName: row.last_name,
                                gender: row.gender,
                                category: row.category,
                                region: row.region,
                                team: row.team
                            };
                            // xxx maybe don't need this in this request but in a different one
                            if (row.total_falls !== null || row.top1 !== null || row.climbs !== null) {
                                climber.scoreCard = {
                                    score: row.total, // xxx this should be calculated?
                                    top1: row.top1,
                                    top2: row.top2,
                                    top3: row.top3,
                                    top4: row.top4,
                                    top5: row.top5,
                                    totalFalls: row.total_falls,
                                    climbs: JSON.parse(row.climbs)
                                };
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
