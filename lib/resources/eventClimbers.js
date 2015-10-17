/*
 eventClimbers.js
 Resources related to climbers at a climbing event

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

var restify = require("restify");
var auth = require("../auth");
var conv = require("../conv");
var errors = require("../errors");
var validate = require("../../common/validation");
var fs = require('fs');
var csvLoader = require("../loadFromCSV");
var dbu = require("../dbUtils");
var util = require("util");

var InvalidInput = errors.InvalidInput;


function getEventClimber(conn, eventId, climberId, callback) {
    conn.query(
        "SELECT ec.climber_id, ec.version, ec.bib_number, c.usac_member_id, c.first_name, c.last_name, c.birth_date, c.gender, ec.category, ec.region, ec.team, ec.coach, ec.updated_by, ec.updated_on " +
        "FROM event_climber ec, climber c WHERE ec.climber_id = c.id AND event_id = ? AND climber_id = ? ", [eventId, climberId], function(err, rows) {
        var climber, row;

        conn.release();

        if (err) {
            return callback(err, null);
        }

        if (rows.length !== 1) {
            return callback(null, null);
        }

        row = rows[0];
        climber = {
            climberId: row.climber_id,
            version: row.version,
            bibNumber: row.bib_number,
            usacMemberId: row.usac_member_id ? row.usac_member_id + "" : "", // force it to be a string
            firstName: row.first_name || "",
            lastName: row.last_name,
            gender: row.gender,
            category: row.category,
            birthDate: row.birth_date,
            region: row.region || "",
            team: row.team || "",
            coach: row.coach || "",
            updatedBy: row.updated_by,
            updatedOn: row.updated_on
        };
        return callback(err, climber);
    });
}

function validateEventClimberInput(input, bibNumberLength) {
    var reason, value;

    input.bibNumber = conv.convertToInteger(input.bibNumber);
    if (conv.isInvalid(input.bibNumber) || input.bibNumber.toString().length !== bibNumberLength) {
        return new InvalidInput("Invalid bibNumber");
    }

    // all the optional strings
    ["team", "coach"].forEach(function(prop) {
        input[prop] = (input[prop] || "").trim();
        if (input[prop] === "") {
            input[prop] = null;
        } else {
            reason = validate.stringLength(prop, input[prop], 100);
            if (reason) {
                return new InvalidInput(reason);
            }
        }
    });
    if (input.gender) {
        value = conv.convertToGender(input.gender);
        if (conv.isInvalid(value)) {
            return new InvalidInput("Invalid gender");
        } else {
            input.gender = value;
        }
    }
    // category not needed if found in master list
    if (input.category) {
        value = conv.convertToCategory(input.category);
        if (conv.isInvalid(value)) {
            return new InvalidInput("Invalid category");
        } else {
            input.category = value;
        }
    }
    if (input.region) {
        value = conv.convertToRegion(input.region);
        if (conv.isInvalid(value)) {
            return new InvalidInput("Invalid region");
        } else {
            input.region = value;
        }
    }

    return null; // valid
}

function makeEventClimber(input) {
    return {
        bib_number: input.bibNumber,
        category: input.category,
        region: input.region,
        team: input.team,
        coach: input.coach
    };
}

function importEventClimber(conn, action, eventId, climber, username, next) {
    var masterFields = ["gender", "category", "region", "team", "coach", "first_name", "last_name", "birth_date"],
        eventFields = ["bib_number", "category", "region", "team", "coach"];

    function getChanges(fields, a, b) {
        var i, f,
            count = 0,
            changes = {};

        for (i = 0; i < fields.length; i++) {
            f = fields[i];
            if (b[f] && a[f] !== b[f]) {
                count += 1;
                changes[f] = b[f];
            }
        }
        if (count === 0) {
            changes = null;
        }
        return changes;
    }

    function insertInEvent(climber, id, warnings) {
        var eventClimber = {
            climber_id: id,
            event_id: eventId,
            bib_number: climber.bib_number,
            category: climber.category || null,
            region: climber.region || null,
            team: climber.team || null,
            coach: climber.coach || null,
            updated_by: username
        };

        conn.query("SELECT bib_number, category, region, team, coach FROM event_climber WHERE climber_id = ? AND event_id = ?;", [id, eventId], function(err, rows) {
            var climberChanges;

            if (err) {
                if (err.fatal) {
                    conn.release();
                    return next(err);
                }
                return next(null, "error", err.message);
            }

            if (rows.length !== 0) {
                climberChanges = getChanges(eventFields, rows[0], eventClimber);
                if (climberChanges) {
                    if (action === "update") {
                        conn.query("UPDATE event_climber SET ?, updated_by = ? WHERE climber_id = ? AND event_id = ?;",
                            [climberChanges, username, id, eventId], function (err, result) {
                                if (err) {
                                    if (err.fatal) {
                                        conn.release();
                                        return next(err);
                                    }
                                    return next(null, "error", err.message);
                                }
                                if (result.affectedRows !== 1) {
                                    return next(null, "error", "Failed to update");
                                }
                                next(null, "updated", warnings);
                            });
                    } else {
                        next(null, "notUpdated", Object.getOwnPropertyNames(climberChanges)); // xxx include the input/database values
                    }
                } else {
                    next(null, "noChange", warnings);
                }
            } else {
                // nothing found so insert
                if (action !== "test") {
                    conn.query("INSERT INTO event_climber SET ?;", eventClimber, function (err /*, result*/) {
                        if (err) {
                            if (err.fatal) {
                                conn.release();
                                return next(err);
                            }
                            if (err.code === "ER_DUP_ENTRY") {
                                return next(null, "error", "Duplicate bib number");
                            } else {
                                return next(null, "error", err.message);
                            }
                        }
                        next(null, "added", warnings);
                    });
                } else {
                    next(null, "added", warnings);
                }
            }
        });
    }

    // xxx first arg null doesn't seem right
    conn.query("SELECT id, usac_member_id, first_name, last_name, birth_date, gender, category, region, team, coach " +
                "FROM climber WHERE (? IS NULL AND lower(first_name) = ? AND lower(last_name) = ?) OR usac_member_id = ?;",
                [null, climber.first_name.toLowerCase(), climber.last_name.toLowerCase(), climber.usac_member_id || null], function(err, rows) {
        var i, row, climberChanges, newClimber, nameMatchIndex, idMatchIndex, nameMatchCount, warning;

        if (err) {
            if (err.fatal) {
                conn.release();
                return next(err);
            }
            return next(null, "error", err.message);
        }

        if (rows.length === 0) {
            // no matching climber was found in the master list so add
            if (climber.gender && climber.category && climber.first_name && climber.last_name) {
                // xxx if the input contains a usac number then perhaps we should have found it should we add the climber to master list? Is it a warning?
                if (action !== "test") {
                    newClimber = {
                        usac_member_id: climber.usac_member_id || null,
                        first_name: climber.first_name,
                        last_name: climber.last_name,
                        gender: climber.gender,
                        category: climber.category,
                        birth_date: climber.birth_date || null,
                        region:  climber.region || null,
                        team: climber.team || null,
                        coach: climber.coach || null,
                        updated_by: username
                    };
                    conn.query("INSERT INTO climber SET ?;", newClimber, function (err, result) {
                        if (err) {
                            if (err.fatal) {
                                conn.release();
                                return next(err);
                            }
                            return next(null, "error", err.message);
                        }
                        insertInEvent(climber, result.insertId);
                    });
                } else {
                    next(null, "added");
                }
            } else {
                next(null, "error", "Climber not found and insufficient information to add");
            }
        } else {
            nameMatchIndex = idMatchIndex = -1;
            nameMatchCount = 0;
            for (i = 0; i < rows.length; i++) {
                row = rows[i];

                // first check if match by member number then match by name
                if (climber.usac_member_id && row.usac_member_id === climber.usac_member_id) {
                    if (idMatchIndex >= 0) {
                        // usac_member_id is a unique key so there can be at most one match
                        conn.release();
                        return next(new restify.InternalError("Multiple matches for usac_member_id: " + climber.usac_member_id));
                    }
                    idMatchIndex = i;
                } else if (row.first_name.toLowerCase() === climber.first_name.toLowerCase() && row.last_name.toLowerCase() === climber.last_name.toLowerCase()) {
                    nameMatchCount += 1;
                    nameMatchIndex = i;
                }
            }
            if (idMatchIndex >= 0) {
                // if there is a match by id use that
                row = rows[idMatchIndex];
            } else if (nameMatchIndex >= 0) {
                if (nameMatchCount > 1) {
                    return next(null, "error", "Multiple matches by name");
                }
                // if there is one match by name use it
                // Note: it should not be possible to match by name if the input has a usac member id
                row = rows[nameMatchIndex];
            }
            // warn about any differences in name, gender, category?, birth_date etc.
            climberChanges = getChanges(masterFields, rows[0], climber);
            if (climberChanges) {
                warning = Object.getOwnPropertyNames(climberChanges);  // xxx include the input/database values
            }

            // Use category, region, team, coach from master list if missing from input
            ["category", "region", "team", "coach"].forEach(function (col) {
                if (!climber[col] && row[col]) {
                    climber[col] = row[col];
                }
            });

            insertInEvent(climber, row.id, warning);
        }
    });
}

function importEventClimbers(conn, action, eventId, climbers, username, next) {
    var index, climber, line,
        originalAction = action, // xxx needed?
        stats = {
            added: 0,      // climber didn't exist and was added to event and master list if needed
            updated: 0,    // climber did exist and there were changes that were updated
            noChange: 0,   // climber did exist and there were no changes so no updates made
            notUpdated: 0, // climber did exist and there were changes but no update was done (because action not update)
                           // The climber is included in the errors collection
            errors: 0,     // there was an error in processing the climber. The climber is included in the errors collection
            warnings: 0    // The climber was added/updated but with warnings
        },
        errors = [];

    function nextClimber() {
        if (index >= climbers.length) {
            next(null, stats, errors);
        } else {
            climber = climbers[index].item;
            line = climbers[index].line;
            importEventClimber(conn, action, eventId, climber, username, function(err, result, reason) {
                if (err) {
                    // these should only be fatal errors
                    return next(err);
                }
                if (result === "added") {
                    stats.added += 1;
                } else if (result === "updated") {
                    stats.updated += 1;
                } else if (result === "noChange") {
                    stats.noChange += 1;
                } else if (result === "notUpdated") {
                    stats.notUpdated += 1;
                    errors.push({
                        line: line,
                        sourceItem: climbers[index].sourceItem,
                        error: "Not updated. Changed columns: " + reason.join(", ")
                    });
                } else {
                    // must be error
                    stats.errors += 1;
                    errors.push({
                        line: line,
                        sourceItem: climbers[index].sourceItem,
                        error: "Error: " + reason
                    });
                }
                if (result === "added" || result === "updated" || result === "noChange") {
                    if (reason) {
                        stats.warnings += 1;
                        errors.push({
                            line: line,
                            sourceItem: climbers[index].sourceItem,
                            // xxx shorten message and columns need to be in resource terms
                            error: "Warning: Master list not updated with changed columns: " + reason.join(", ")
                        });
                    }

                }
                index += 1;
                nextClimber();
            });
        }
    }

    index = 0;
    if (action === "replace") {
        // note this does not clear any data that may have previously been added to the climber table from this event
        conn.query("DELETE from event_climber where event_id = ?;", [eventId], function (err /*, result */) {
            if (err) {
                return next(err);
            }
            action = "add";
            nextClimber();
        });
    } else {
        nextClimber();
    }
}

var eventClimberColumnInfo = {
    climberId: {
        column: "ec.climber_id",
        type: "number",
        required: true
    },
    bibNumber: {
        column: "ec.bib_number",
        type: "number"
    },
    usacMemberId: {
        column: "c.usac_member_id",
        type: "number"
    },
    firstName: {
        column: "c.first_name",
        type: "string"
    },
    lastName: {
        column: "c.last_name",
        type: "string"
    },
    gender: {
        column: "c.gender",
        type: "string"
    },
    birthDate: {
        column: "c.birth_date",
        type: "date"
    },
    category: {
        column: "ec.category",
        type: "string"
    },
    region: {
        column: "ec.region",
        type: "string"
    },
    team: {
        column: "ec.team",
        type: "string"
    },
    coach: {
        column: "ec.coach",
        type: "string"
    },
    updatedBy: {
        column: "ec.updated_by",
        type: "string"
    },
    updatedOn: {
        column: "ec.updated_on",
        type: "date"
    },
    version: {
        column: "ec.version",
        type: "number"
    }
};

function addResources(server, dbPool) {
    var log = server.log;

    /*
     * List all climbers for a given event
     *
     * URI: data/events/<event-id>/climbers?<standard collection parameters>
     * Method: GET
     * Role: Admin
     * Input: none
     * Output: Collection resource returning event climber objects
     */
    server.get("data/events/:eventId/climbers", function (req, res, next) {
        var page, offset, results,
            query = "",
            eventId = conv.convertToIntegerId(req.params.eventId);

        if (!auth.validateAuthAndRole(auth.ROLE_READER, req, next)) {
            return;
        }

        if (conv.isInvalid(eventId)) {
            return next(new restify.ResourceNotFoundError("Invalid event id"));
        }

        query = dbu.createCollectionQuery(
            "SELECT{{ |calcFoundRows}}{{ |columns}} FROM event_climber ec, climber c WHERE ec.climber_id = c.id AND ec.event_id = ? {{ AND|filters}}{{order}}{{page}};",
            eventClimberColumnInfo, {
                columnsParam: req.params.c,
                excludeColumnsParam: req.params.x,
                pageParam: req.params.p,
                filtersParam: req.params.f,
                searchParam: req.params.s,
                orderParam: req.params.o
            });
        if (query instanceof Error) {
            return next(query);
        }

        if (req.params.p) {
            page = dbu.getLimitAndOffset(req.params.p);
            // errors should have already been caught but just in case
            if (page instanceof Error) {
                return next(page);
            }
            offset = page[1];
        }

        dbPool.getConnection(function (err, conn) {
            if (err) {
                return next(err);
            }
            conn.query(query, [eventId], function (err, rows) {
                var i, climber, row,
                    climbers = [];

                if (err) {
                    conn.release();
                    return next(err);
                }

                for (i = 0; i < rows.length; i++) {
                    row = rows[i];
                    climber = {
                        climberId: row.climber_id,
                        bibNumber: row.bib_number,
                        usacMemberId: row.usac_member_id ? row.usac_member_id + "" : null, // force it to be a string or null
                        firstName: row.first_name || "",
                        lastName: row.last_name || "",
                        gender: row.gender,
                        category: row.category,
                        birthDate: row.birth_date,
                        region: row.region || "",
                        team: row.team || "",
                        coach: row.coach || "",
                        updatedBy: row.updated_by,
                        updatedOn: row.updated_on,
                        version: row.version
                    };
                    climbers.push(climber);
                }
                results = {
                    items: climbers
                };
                if (page) {
                    conn.query("SELECT FOUND_ROWS() AS total;", function (err, rows) {

                        conn.release();
                        if (err) {
                            return next(err);
                        }
                        results.offset = offset;
                        if (rows.length === 1) {
                            results.total = rows[0].total;
                        }
                        res.send(results);
                        return next();
                    });
                } else {
                    conn.release();
                    res.send(results);
                    return next();
                }
            });
        });
    });

    /*
     * Create event climber
     * This just creates the association between an event and a climber
     *
     * URI: data/events/<event-id>/climbers
     * Method: POST
     * Role: Admin
     * Input is an event climber object it must include climberId
     * Output: event climber object including id
     */
    server.post("data/events/:eventId/climbers", function (req, res, next) {
        var eventId = conv.convertToIntegerId(req.params.eventId),
            input = req.body;

        if (!auth.validateAuthAndRole(auth.ROLE_ADMIN, req, next)) {
            return;
        }

        if (conv.isInvalid(eventId)) {
            return next(new restify.ResourceNotFoundError("Invalid event id"));
        }

        dbPool.getConnection(function (err, conn) {
            if (err) {
                return next(err);
            }

            conn.query("SELECT id, bib_number_digits " +
                "FROM event WHERE id = ?;", [eventId], function (err, rows) {
                var climber, e, bibNumberLength, climberId;

                if (err) {
                    conn.release();
                    return next(err);
                }
                if (rows.length !== 1) {
                    return next(new restify.ResourceNotFoundError("No such event"));
                }

                bibNumberLength = rows[0].bib_number_digits;

                e = validateEventClimberInput(input, bibNumberLength);
                if (e) {
                    return next(e);
                }

                climber = makeEventClimber(input);
                if (input.climberId) {
                    climberId = climber.climber_id = conv.convertToIntegerId(input.climberId);
                    if (conv.isInvalid(climberId)) {
                        return next(new InvalidInput("Invalid climberId"));
                    }
                } else {
                    return next(new InvalidInput("Missing required climberId"));
                }
                climber.event_id = eventId;

                conn.query("INSERT INTO event_climber SET updated_on = NOW(), updated_by = ?, ?;", [req.authInfo.username, climber], function (err, result) {
                    if (err) {
                        conn.release();
                        if (err.code === "ER_DUP_ENTRY") {
                            return next(new InvalidInput("Climber exists or duplicate bibNumber"));
                        }
                        return next(err);
                    }
                    getEventClimber(conn, eventId, climberId, function (err, climber) {
                        conn.release();
                        if (err) {
                            return next(err);
                        }
                        if (!climber) {
                            return next(new restify.InternalError("Not created"));
                        }
                        res.header("Location", "/data/events/" + eventId + "/climbers/" + climberId);
                        res.send(climber);
                        return next();
                    });

                });
            });
        });
    });

    /*
     * Get event climber
     *
     * URI: data/events/<event-id>/climbers/<climber-id>
     * Method: GET
     * Role: Reader
     * Input none
     * Output: climber object
     */
    server.get("data/events/:eventId/climbers/:climberId", function (req, res, next) {
        var eventId = conv.convertToIntegerId(req.params.eventId),
            climberId = conv.convertToIntegerId(req.params.climberId);

        if (!auth.validateAuthAndRole(auth.ROLE_READER, req, next)) {
            return;
        }

        if (conv.isInvalid(eventId)) {
            return next(new restify.ResourceNotFoundError("Invalid event id"));
        }

        if (conv.isInvalid(climberId)) {
            return next(new restify.ResourceNotFoundError("Invalid climber id"));
        }

        dbPool.getConnection(function (err, conn) {
            if (err) {
                return next(err);
            }
            getEventClimber(conn, eventId, climberId, function (err, climber) {
                conn.release();
                if (err) {
                    return next(err);
                }
                if (!climber) {
                    return next(new restify.ResourceNotFoundError("No such climber"));
                }
                res.send(climber);
                return next();
            });
        });
    });

    /*
     * Update event climber
     * Only update columns of the event climber.
     *
     * URI: data/events/<event-id>/climbers/<climber-id>
     * Method: PUT
     * Role: Admin
     * Input event climber object with values to change including version,
     * Output: event climber object
     */
    server.put("data/events/:eventId/climbers/:climberId", function (req, res, next) {
        var eventId = conv.convertToIntegerId(req.params.eventId),
            climberId = conv.convertToIntegerId(req.params.climberId),
            input = req.body;

        if (!auth.validateAuthAndRole(auth.ROLE_ADMIN, req, next)) {
            return;
        }

        if (conv.isInvalid(eventId)) {
            return next(new restify.ResourceNotFoundError("Invalid event id"));
        }

        if (conv.isInvalid(climberId)) {
            return next(new restify.ResourceNotFoundError("Invalid climber id"));
        }

        dbPool.getConnection(function (err, conn) {
            if (err) {
                return next(err);
            }

            conn.query("SELECT id, bib_number_digits " +
                "FROM event WHERE id = ?;", [eventId], function (err, rows) {
                var climber, e, bibNumberLength;

                if (err) {
                    conn.release();
                    return next(err);
                }
                if (rows.length !== 1) {
                    return next(new restify.ResourceNotFoundError("No such event"));
                }

                bibNumberLength = rows[0].bib_number_digits;

                e = validateEventClimberInput(input, bibNumberLength);
                if (e) {
                    return next(e);
                }

                climber = makeEventClimber(input);

                // A trigger updates the version
                conn.query("UPDATE event_climber SET updated_on = NOW(), updated_by = ?, ? WHERE event_id = ? AND climber_id = ? AND version = ?;",
                    [req.authInfo.username, climber, eventId, climberId, input.version], function (err, result) {
                        if (err) {
                            conn.release();
                            return next(err);
                        }

                        if (result.affectedRows !== 1) {
                            conn.query("SELECT 1 FROM event_climber where event_id = ? AND climber_id = ?", [eventId, climberId], function (err, rows) {
                                conn.release();
                                if (!err) {
                                    if (rows.length !== 1) {
                                        err = new restify.ResourceNotFoundError("No such climber");
                                    } else {
                                        err = new restify.ConflictError("Stale version");
                                    }
                                }
                                return next(err);
                            });
                        } else {
                            getEventClimber(conn, eventId, climberId, function (err, climber) {
                                conn.release();
                                if (err) {
                                    return next(err);
                                }
                                if (!climber) {
                                    return next(new restify.InternalError("Not found after update"));
                                }
                                res.send(climber);
                                return next();
                            });
                        }

                    });
            });
        });

    });

    /*
     * Delete event climber
     *
     * URI: data/events/<event-id>/climbers/<climber-id>?version=<n>
     * Method: DELETE
     * Role: Admin
     * Input none
     * Output: none
     */
    server.del("data/events/:eventId/climbers/:climberId", function (req, res, next) {
        var climberId = conv.convertToIntegerId(req.params.climberId),
            eventId = conv.convertToIntegerId(req.params.eventId),
            version = req.params.version;

        if (!auth.validateAuthAndRole(auth.ROLE_ADMIN, req, next)) {
            return;
        }

        if (conv.isInvalid(eventId)) {
            return next(new restify.ResourceNotFoundError("Invalid event id"));
        }

        if (conv.isInvalid(climberId)) {
            return next(new restify.ResourceNotFoundError("Invalid climber id"));
        }

        if (!version) {
            return next(new restify.ResourceNotFoundError("Version param required"));
        }

        dbPool.getConnection(function (err, conn) {
            if (err) {
                return next(err);
            }

            conn.query("DELETE FROM event_climber WHERE event_id = ? AND climber_id = ? AND version = ?;", [eventId, climberId, version], function (err, result) {
                if (err) {
                    conn.release();
                    return next(err);
                }
                if (result.affectedRows !== 1) {
                    conn.query("SELECT id FROM event_climber where event_id = ? AND climber_id = ?", [eventId, climberId], function (err, rows) {
                        conn.release();
                        if (!err) {
                            if (rows.length !== 1) {
                                err = new restify.ResourceNotFoundError("No such climber");
                            } else {
                                err = new restify.ConflictError("Stale version");
                            }
                        }
                        return next(err);
                    });
                } else {
                    res.send(204, "No Content");
                }
            });
        });
    });

    /*
     * Import event climbers from an uploaded file
     * URI: data/events/<event-id>/climbers-upload
     * Method: POST
     * Role: Admin
     * Input:
     *      file CSV file
     *      hasHeader Boolean
     *      action one of "add", "replace", "update", "test"
     *      dateFormat
     *      continueOnErrors
     *      fields , separated list of properties
     *      xxx todo have an option to update master list?
     * Output: {status: "PARTIAL" | "OK" | ERROR, stats: stats, errors: errors }
     */
    server.post("data/events/:eventId/climbers-upload", function(req,res,next) {
        var i, reason, csvFile, action, fields, columns, hasHeader, dateFormat, continueOnErrors,
            eventId = conv.convertToIntegerId(req.params.eventId),
            input = req.body;

        csvFile = req.files.file.path;

        if (!auth.validateAuthAndRole(auth.ROLE_ADMIN, req, next)) {
            return;
        }

        if (conv.isInvalid(eventId)) {
            return next(new restify.ResourceNotFoundError("Invalid event id"));
        }

        // the request is not in json format so do some conversions also validation
        action = input.action;
        reason = validate.stringInSet("action", action, ["add", "replace", "update", "test"]);
        if (reason) {
            return next(new InvalidInput(reason));
        }

        hasHeader = conv.convertToBool(input.hasHeader);
        if (conv.isInvalid(hasHeader)) {
            return next(new InvalidInput("Invalid value for hasHeader"));
        }

        continueOnErrors = conv.convertToBool(input.continueOnErrors);
        if (conv.isInvalid(continueOnErrors)) {
            return next(new InvalidInput("Invalid value for continueOnErrors"));
        }

        dateFormat = input.dateFormat;
        reason = validate.stringInSet("dateFormat", dateFormat, ["ymd","dmy","mdy"]);
        if (reason) {
            return next(new InvalidInput(reason));
        }

        fields = input.fields;
        if (!fields || ("" + fields).length === 0) {
            return next(new InvalidInput("Missing required input fields"));
        }

        fields = input.fields.split(",");
        for (i = 0; i < fields.length; i++) {
            if (validate.stringInSet("field", fields[i],
                    [ "bibNumber", "usacMemberId", "gender", "category", "region", "team", "coach", "firstName", "lastName", "birthDate"])) {
                return next(new InvalidInput("Unknown field name: " + fields[i]));
            }
        }
        // xxx should there be an option to assign bib numbers?
        ["bibNumber", "usacMemberId", "gender", "category", "firstName", "lastName"].forEach(function(prop) {
            if (fields.indexOf(prop) < 0) {
                return next(new InvalidInput("Fields is missing required field: " + prop));
            }
        });
        // convert fields properties to database columns
        columns = [];
        for (i = 0; i < fields.length; i++) {
            columns[i] = eventClimberColumnInfo[fields[i]].column.replace(/^[^.]*\./, ""); // column without table prefix
        }

        dbPool.getConnection(function(err, conn) {
            if (err) {
                return next(err);
            }

            conn.query("SELECT id, bib_number_digits " +
                "FROM event WHERE id = ?;", [eventId], function (err, rows) {
                var bibNumberLength;

                if (err) {
                    conn.release();
                    return next(err);
                }
                if (rows.length !== 1) {
                    return next(new restify.ResourceNotFoundError("No such event"));
                }

                bibNumberLength = rows[0].bib_number_digits;

                function validateClimberRow(climber, addError) {
                    var value;

                    climber.bib_number = conv.convertToInteger(climber.bib_number);
                    if (conv.isInvalid(climber.bib_number) || climber.bib_number.toString().length !== bibNumberLength) {
                        addError("Invalid bibNumber");
                    }

                    // usac_member_id is not required for event climbers but if present must be a number
                    if (climber.usac_member_id) {
                        climber.usac_member_id = conv.convertToInteger(climber.usac_member_id);
                        if (conv.isInvalid(climber.usac_member_id)) {
                            addError("Invalid usacMemberId");
                        }
                    }

                    // birth_date
                    if (climber.birth_date) {
                        value = conv.convertToDate(climber.birth_date, dateFormat);
                        if (conv.isInvalid(value)) {
                            addError("Invalid birthDate");
                        } else {
                            climber.birth_date = value;
                        }
                    } else {
                        climber.birth_date = null;
                    }

                    if (!climber.last_name || climber.last_name.length === 0) {
                        addError("Missing last_name.");
                    }
                    ["last_name", "first_name", "region", "team", "coach"].forEach(function(prop) {
                        if (climber[prop] && climber[prop].length > 100) {
                            addError("Column " + prop  + " too long");
                        }
                    });
                    // gender not needed if found in master list
                    if (climber.gender) {
                        value = conv.convertToGender(climber.gender);
                        if (conv.isInvalid(value)) {
                            addError("Invalid gender");
                        } else {
                            climber.gender = value;
                        }
                    }
                    // category not needed if found in master list
                    if (climber.category) {
                        value = conv.convertToCategory(climber.category);
                        if (conv.isInvalid(value)) {
                            addError("Invalid category");
                        } else {
                            climber.category = value;
                        }
                    }
                    if (climber.region) {
                        value = conv.convertToRegion(climber.region);
                        if (conv.isInvalid(value)) {
                            addError("Invalid region");
                        } else {
                            climber.region = value;
                        }
                    }
                }

                csvLoader.loadFromCSV(csvFile, hasHeader, fields.length, columns, fields, validateClimberRow, function (err, climbers, total) {
                    var inputErrors = [];

                    // delete file don't wait
                    fs.unlink(csvFile, function (err) {
                        if (err) {
                            log.error("Failed to delete file '" + csvFile + "'. Reason: " + err.message);
                        }
                    });

                    if (err) {
                        if (err.name === "CSVDataError") {
                            inputErrors = err.errors;
                        } else {
                            return next(err);
                        }
                    }

                    // Check for duplicates when adding to the database
                    if (inputErrors.length > 0 && !continueOnErrors) {
                        res.send({
                            status: "ERROR", stats: {
                                added: 0,
                                updated: 0,
                                noChange: 0,
                                notUpdated: 0,
                                totalLines: total,
                                errors: inputErrors.length
                            }, errors: inputErrors
                        });
                        next();
                        return;
                    }

                    importEventClimbers(conn, action, eventId, climbers, req.authInfo.username, function (err, stats, errors) {
                        conn.release();
                        if (err) {
                            return next(err);
                        }

                        if (errors.length === 0 && inputErrors.length === 0) {
                            res.send({status: "OK", stats: stats});
                        } else {
                            // include CSV errors in error stats
                            stats.errors += inputErrors.length;
                            // concat errors and sort by line
                            errors = errors.concat(inputErrors);
                            errors.sort(function (a, b) {
                                return a.line - b.line;
                            });
                            for (i = 0; i < errors.length; i++) {
                                delete errors[i].item;
                            }
                            stats.totalLines = total;
                            res.send({status: "PARTIAL", stats: stats, errors: errors});
                        }
                        next();
                    });
                });
            });
        });
    });

}

module.exports = {
    addResources: addResources
};
