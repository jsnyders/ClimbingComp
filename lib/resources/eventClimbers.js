/*
 climbers.js
 Resources related to global list of climbers

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

function getEventClimber(conn, id, callback) {
    //xxx
    conn.query("SELECT id, version, usac_member_id, first_name, last_name, gender, category, birth_date, region, team, coach, updated_by, updated_on " +
    "FROM climber " +
    "WHERE id = ?;", [id], function(err, rows) {
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
            climberId: row.id,
            version: row.version,
            usacMemberId: row.usac_member_id + "", // force it to be a string
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

function validateEventClimberInput(input) {
    var reason;

    input.usacMemberId = (input.usacMemberId || "").trim();
    reason = validate.regExp("usacMemberId", input.usacMemberId, /^\d+$/, "all digits");
    if (input.usacMemberId === "") {
        input.usacMemberId = null;
    } else {
        if (reason) {
            return new InvalidInput(reason);
        }
    }

    // all the optional strings
    ["firstName", "region", "team", "coach"].forEach(function(prop) {
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

    input.lastName = (input.lastName || "").trim();
    reason = validate.requiredStringLength("lastName", input.lastName, 100);
    if (reason) {
        return new InvalidInput(reason);
    }

    reason = validate.stringInSet("gender", input.gender, ["Male", "Female"]);
    if (reason) {
        return new InvalidInput(reason);
    }

    reason = validate.stringInSet("category", input.category, ["Youth-D", "Youth-C", "Youth-B", "Youth-A", "Junior", "Adult", "Open", "Masters"]);
    if (reason) {
        return new InvalidInput(reason);
    }

    // xxx birthDate, create one from the other as needed

    return null; // valid
}

function makeEventClimber(input) {
    return {
        usac_member_id: input.usacMemberId,
        first_name: input.firstName,
        last_name: input.lastName,
        gender: input.gender,
        category: input.category,
        birth_date: new Date(input.birthDate), // xxx
        region: input.region,
        team: input.team,
        coach: input.coach
    };
}

function importEventClimber(conn, action, climber, username, next) {
    //xxx
    var fields = ["gender", "category", "region", "team", "coach", "first_name", "last_name", "birth_date"];

    function getChanges(a, b) {
        var i, f,
            count = 0,
            changes = {};

        for (i = 0; i < fields.length; i++) {
            f = fields[i];
            if (b[f] !== undefined && a[f] !== b[f]) {
                count += 1;
                changes[f] = b[f];
            }
        }
        if (count === 0) {
            changes = null;
        }
        return changes;
    }

    conn.query("SELECT id, usac_member_id, first_name, last_name, birth_date, gender, category, region, team, coach " +
    "FROM climber WHERE usac_member_id = ?;", [climber.usac_member_id], function(err, rows) {
        var climberChanges;

        if (err) {
            if (err.fatal) {
                return next(err);
            }
            return next(null, "error", err.message);
        }

        if (rows.length !== 0) {
            if (rows.length !== 1) {
                // usac_member_id is a unique key so can't be more than one
                return next(new restify.InternalError("Multiple matches for usac_member_id: " + climber.usac_memember_id));
            }

            climberChanges = getChanges(rows[0], climber);
            if (climberChanges) {
                if (action === "update") {
                    conn.query("UPDATE climber SET ?, updated_by = ? WHERE id = ? AND usac_member_id = ?;",
                        [climberChanges, username, rows[0].id, climber.usac_memember_id], function (err, result) {
                            if (err) {
                                if (err.fatal) {
                                    return next(err);
                                }
                                return next(null, "error", err.message);
                            }
                            next(null, "updated");
                        });
                } else {
                    next(null, "notUpdated", Object.getOwnPropertyNames(climberChanges));
                }
            } else {
                next(null, "noChange");
            }
        } else if (action === "test") {
            // just testing it most likely would have been added OK
            next(null, "added");
        } else {
            conn.query("INSERT INTO climber SET ?, updated_by = ?;", [climber, username], function(err, result) {
                if (err) {
                    if (err.fatal) {
                        return next(err);
                    }
                    return next(null, "error", err.message);
                }
                next(null, "added");
            });
        }

    });
}

function importEventClimbers(conn, action, climbers, username, next) {
    var index, climber, line,
        originalAction = action,
        stats = {
            added: 0,      // climber didn't exist and was added
            updated: 0,    // climber did exist and there were changes that were updated
            noChange: 0,   // climber did exist and there were no changes so no updates made
            notUpdated: 0, // climber did exist and there were changes but no update was done (because action not update)
                           // The climber is included in the errors collection
            errors: 0      // there was an error in processing the climber. The climber is included in the errors collection
        },
        errors = [];

    function nextClimber() {
        if (index >= climbers.length) {
            next(null, stats, errors);
        } else {
            climber = climbers[index].item;
            line = climbers[index].line;
            importEventClimber(conn, action, climber, username, function(err, result, reason) {
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
                    if (originalAction === "replace") {
                        errors.push({
                            line: line,
                            item: climber,
                            error: "Duplicate no change",
                            changes: reason
                        });
                    }
                } else if (result === "notUpdated") {
                    stats.notUpdated += 1;
                    errors.push({
                        line: line,
                        item: climber,
                        error: originalAction === "replace" ? "Duplicate not updated" : "Not updated",
                        changes: reason
                    });
                } else {
                    // must be error
                    stats.error += 1;
                    errors.push({
                        line: line,
                        item: climber,
                        error: reason
                    });
                }
                index += 1;
                nextClimber();
            });
        }
    }

    index = 0;
    if (action === "replace") {
        conn.query("DELETE from climber;", function (err, result) {
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
            "SELECT{{ |calcFoundRows}}{{ |columns}} FROM event_climber ec, climber c WHERE ec.climber_id = c.id AND ec.event_id = ? {{ WHERE|filters}}{{order}}{{page}};",
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
                        climberId: row.id,
                        bibNumber: row.bib_number,
                        usacMemberId: row.usac_member_id + "", // force it to be a string
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
     * xxx should this just create the association between an event and a climber or create the climber as needed
     * should the data/climbers (create climber) resource have an option to add to an event
     *
     * URI: data/events/<event-id>/climbers
     * Method: POST
     * Role: Admin
     * Input is an event climber object
     * Output: event climber object including id
     */
    server.post("data/events/:eventId/climbers", function (req, res, next) {
        var climber, e,
            eventId = parseInt(req.params.eventId, 10),
            input = req.body;

        if (!auth.validateAuthAndRole(auth.ROLE_ADMIN, req, next)) {
            return;
        }

        if (conv.isInvalid(eventId)) {
            return next(new restify.ResourceNotFoundError("Invalid event id"));
        }

        e = validateEventClimberInput(input);
        if (e) {
            return next(e);
        }

        climber = makeEventClimber(input);

        dbPool.getConnection(function (err, conn) {
            if (err) {
                return next(err);
            }

            // xxx
            conn.query("INSERT INTO climber SET updated_on = NOW(), updated_by = ?, ?;", [req.authInfo.username, climber], function (err, result) {
                var climberId;

                if (err) {
                    conn.release();
                    if (err.code === "ER_DUP_ENTRY") {
                        return next(new InvalidInput("Climber exists"));
                    }
                    return next(err);
                }
                climberId = result.insertId;
                getEventClimber(conn, climberId, function (err, climber) {
                    conn.release();
                    if (err) {
                        return next(err);
                    }
                    if (!climber) {
                        return next(new restify.InternalError("Not created"));
                    }
                    res.header("Location", "/data/climbers/" + climberId);
                    res.send(climber);
                    return next();
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
     * xxx can probably only update the bib_number
     *
     * URI: data/events/<event-id>/climbers/<climber-id>
     * Method: PUT
     * Role: Admin
     * Input event climber object with values to change including version,
     * Output: event climber object
     */
    server.put("data/events/:eventId/climbers/:climberId", function (req, res, next) {
        var climber, e,
            eventId = conv.convertToIntegerId(req.params.eventId),
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

        e = validateEventClimberInput(input);
        if (e) {
            return next(e);
        }

        climber = makeEventClimber(input);

        dbPool.getConnection(function (err, conn) {
            if (err) {
                return next(err);
            }

            // xxx
            // A trigger updates the version
            conn.query("UPDATE climber SET updated_on = NOW(), updated_by = ?, ? WHERE id = ? AND version = ?;",
                [req.authInfo.username, climber, climberId, input.version], function(err, result) {
                    if (err) {
                        conn.release();
                        return next(err);
                    }

                    if (result.affectedRows !== 1) {
                        conn.query("SELECT id FROM climber where id = ?", climberId, function (err, rows) {
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
                        getEventClimber(conn, climberId, function (err, climber) {
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

            //xxx
            conn.query("DELETE FROM climber WHERE id = ? and version = ?;", [climberId, version], function (err, result) {
                if (err) {
                    conn.release();
                    return next(err);
                }
                if (result.affectedRows !== 1) {
                    conn.query("SELECT id FROM climber where id = ?", climberId, function (err, rows) {
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
     *      fields , separated list of properties
     * Output: {status: "PARTIAL" | "OK", stats: stats, errors: errors }
     */
    server.post("data/events/:eventId/climbers-upload", function(req,res,next) {
        var i, reason, csvFile, action, fields, hasHeader,
            eventId = conv.convertToIntegerId(req.params.eventId),
            input = req.body;

        csvFile = req.files.file.path;
        console.log("xxx event climbers upload ", csvFile, req.files.file.name );

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
        ["bibNumber", "usacNemberId", "gender", "category", "firstName", "lastName"].forEach(function(prop) {
            if (fields.indexOf(prop) < 0) {
                return next(new InvalidInput("Fields is missing required field: " + prop));
            }
        });
        // convert fields properties to database columns
        for (i = 0; i < fields.length; i++) {
            fields[i] = eventClimberColumnInfo[fields[i]].column.replace(/^[^.]*\./, ""); // column without table prefix
        }

        function validateClimberRow(climber, addError) {
            var value;

            // usac_member_id is not required for event climbers

            // xxx date/year,

            if (!climber.last_name || climber.last_name.length === 0) {
                addError("Missing last_name.");
            }
            ["last_name", "first_name", "region", "team", "coach"].forEach(function(prop) {
                if (climber[prop] && climber[prop] > 100) {
                    addError("Column " + prop  + " too long");
                }
            });
            value = conv.convertToGender(climber.gender);
            if (conv.isInvalid(value)) {
                addError("Invalid gender");
            } else {
                climber.gender = value;
            }
            value = conv.convertToCategory(climber.category);
            if (conv.isInvalid(value)) {
                addError("Invalid category");
            } else {
                climber.category = value;
            }
            value = conv.convertToRegion(climber.region);
            if (conv.isInvalid(value)) {
                addError("Invalid region");
            } else {
                climber.region = value;
            }
        }

        csvLoader.loadFromCSV(csvFile, hasHeader, fields.length, fields, validateClimberRow, function(err, climbers) {
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
                    /// xxx option to continue or not
                } else {
                    return next(err);
                }
            }

            dbPool.getConnection(function(err, conn) {
                if (err) {
                    return next(err);
                }
                importEventClimbers(conn, action, climbers, req.authInfo.username, function(err, stats, errors) {
                    conn.release();
                    if (err) {
                        return next(err);
                    }

                    if (errors.length === 0 && inputErrors.length === 0) {
                        res.send({status: "OK", stats: stats });
                    } else {
                        // include CSV errors in error stats
                        stats.errors += inputErrors.length;
                        // concat errors and sort by line
                        errors = errors.concat(inputErrors);
                        errors.sort(function(a, b) {
                            return a.line - b.line;
                        });
                        res.send({status: "PARTIAL", stats: stats, errors: errors });
                    }
                    next();
                });
            });
        });
    });

}

module.exports = {
    addResources: addResources
};
