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

function getClimber(conn, id, callback) {
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

function validateClimberInput(input) {
    var reason;

    // xxx should this be required
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

function makeClimber(input) {
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

function importClimber(conn, action, climber, username, next) {
    var fields = ["gender", "category", "region", "team", "coach", "first_name", "last_name" /*xxx, "birth_date"*/];

    function getChanges(a, b) {
        var i, f,
            count = 0,
            changes = {};

        for (i = 0; i < fields.length; i++) {
            f = fields[i];
// xxx dates are off by time zone? 4 hrs so skip for now
//            if (f === "birth_date") {
//                console.log("xxx " + a[f] + ", " + b[f]);
//            }
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
                conn.release();
                return next(err);
            }
            return next(null, "error", err.message);
        }

        if (rows.length !== 0) {
            if (rows.length !== 1) {
                // usac_member_id is a unique key so can't be more than one
                conn.release();
                return next(new restify.InternalError("Multiple matches for usac_member_id: " + climber.usac_member_id));
            }

            climberChanges = getChanges(rows[0], climber);
            if (climberChanges) {
                if (action === "update") {
                    conn.query("UPDATE climber SET ?, updated_by = ? WHERE id = ? AND usac_member_id = ?;",
                        [climberChanges, username, rows[0].id, climber.usac_member_id], function (err, result) {
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
            // batch up the inserts
            next(null, "added");
        }

    });
}

function importClimbers(conn, action, columns, climbers, username, next) {
    var index, climber, line,
        batchInserts = [],
        stats = {
            added: 0,      // climber didn't exist and was added
            updated: 0,    // climber did exist and there were changes that were updated
            noChange: 0,   // climber did exist and there were no changes so no updates made
            notUpdated: 0, // climber did exist and there were changes but no update was done (because action not update)
                           // The climber is included in the errors collection
            errors: 0      // there was an error in processing the climber. The climber is included in the errors collection if known
        },
        errors = [];

    function nextClimber() {
        if (index >= climbers.length) {
            if (batchInserts.length > 0) {
                insertNextBatch();
            } else {
                next(null, stats, errors);
            }
        } else {
            climber = climbers[index].item;
            line = climbers[index].line;
            importClimber(conn, action, climber, username, function(err, result, reason) {
                if (err) {
                    // these should only be fatal errors
                    return next(err);
                }
                if (result === "added") {
                    if (action === "test") {
                        stats.added += 1;
                    } else {
                        addToBatchInsert(climber);
                    }
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
                index += 1;
                nextClimber();
            });
        }
    }

    function addToBatchInsert(climber) {
        var rec = [];
        columns.forEach(function(c) {
            rec.push(climber[c]);
        });
        rec.push(username);
        batchInserts.push(rec);
    }

    function insertNextBatch() {
        // xxx is there a limit of how many can be batched up?
        conn.query("INSERT IGNORE INTO climber (" + columns.join(", ") + ", updated_by ) VALUES ?;", [batchInserts], function(err, result) {

            if (err) {
                conn.release();
                return next(err);
            }
            stats.errors += batchInserts.length - result.affectedRows;
            stats.added += result.affectedRows;

            next(null, stats, errors);
        });
    }

    index = 0;
    if (action === "replace") {
        conn.query("DELETE from climber;", function (err /*,result */) {
            var i;
            if (err) {
                return next(err);
            }
            for (i = 0; i < climbers.length; i++) {
                addToBatchInsert(climbers[i].item);
            }
            if (batchInserts.length > 0) {
                insertNextBatch();
            } else {
                next(null, stats, errors);
            }
        });
    } else {
        nextClimber();
    }
}

var climberColumnInfo = {
    climberId: {
        column: "id",
        type: "number",
        required: true
    },
    usacMemberId: {
        column: "usac_member_id",
        type: "number"
    },
    firstName: {
        column: "first_name",
        type: "string"
    },
    lastName: {
        column: "last_name",
        type: "string"
    },
    gender: {
        column: "gender",
        type: "string"
    },
    category: {
        column: "category",
        type: "string"
    },
    birthDate: {
        column: "birth_date",
        type: "date"
    },
    region: {
        column: "region",
        type: "string"
    },
    team: {
        column: "team",
        type: "string"
    },
    coach: {
        column: "coach",
        type: "string"
    },
    updatedBy: {
        column: "updated_by",
        type: "string"
    },
    updatedOn: {
        column: "updated_on",
        type: "date"
    },
    version: {
        column: "version",
        type: "number"
    }
};


function addResources(server, dbPool) {
    var log = server.log;

    /*
     * List all climbers
     *
     * URI: data/climbers?<standard collection parameters>
     * Method: GET
     * Role: Admin
     * Input: none
     * Output: Collection resource returning climber objects
     */
    server.get("data/climbers", function (req, res, next) {
        var page, offset, results,
            query = "";

        if (!auth.validateAuthAndRole(auth.ROLE_READER, req, next)) {
            return;
        }

        query = dbu.createCollectionQuery("SELECT{{ |calcFoundRows}}{{ |columns}} FROM climber{{ WHERE|filters}}{{order}}{{page}};",
            climberColumnInfo, {
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
            conn.query(query, function (err, rows) {
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
     * Create climber
     *
     * URI: data/climbers
     * Method: POST
     * Role: Admin
     * Input is a climber object
     * Output: climber object including id
     */
    server.post("data/climbers", function (req, res, next) {
        var climber, e,
            input = req.body;

        if (!auth.validateAuthAndRole(auth.ROLE_ADMIN, req, next)) {
            return;
        }

        e = validateClimberInput(input);
        if (e) {
            return next(e);
        }

        climber = makeClimber(input);

        dbPool.getConnection(function (err, conn) {
            if (err) {
                return next(err);
            }

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
                getClimber(conn, climberId, function (err, climber) {
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
     * Get climber
     *
     * URI: data/climbers/<climber-id>
     * Method: GET
     * Role: Reader
     * Input none
     * Output: climber object
     */
    server.get("data/climbers/:climberId", function (req, res, next) {
        var climberId = conv.convertToIntegerId(req.params.climberId);

        if (!auth.validateAuthAndRole(auth.ROLE_READER, req, next)) {
            return;
        }

        if (conv.isInvalid(climberId)) {
            return next(new restify.ResourceNotFoundError("Invalid climber id"));
        }

        dbPool.getConnection(function (err, conn) {
            if (err) {
                return next(err);
            }
            getClimber(conn, climberId, function (err, climber) {
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
     * Update climber
     *
     * URI: data/climbers/<climber-id>
     * Method: PUT
     * Role: Admin
     * Input climber object with values to change including version,
     * Output: climber object
     */
    server.put("data/climbers/:climberId", function (req, res, next) {
        var climber, e,
            climberId = conv.convertToIntegerId(req.params.climberId),
            input = req.body;

        if (!auth.validateAuthAndRole(auth.ROLE_ADMIN, req, next)) {
            return;
        }

        if (conv.isInvalid(climberId)) {
            return next(new restify.ResourceNotFoundError("Invalid climber id"));
        }

        e = validateClimberInput(input);
        if (e) {
            return next(e);
        }

        climber = makeClimber(input);

        dbPool.getConnection(function (err, conn) {
            if (err) {
                return next(err);
            }

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
                    getClimber(conn, climberId, function (err, climber) {
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
     * Delete climber
     *
     * URI: data/climbers/<climber-id>?version=<n>
     * Method: DELETE
     * Role: Admin
     * Input none
     * Output: none
     */
    server.del("data/climbers/:climberId", function (req, res, next) {
        var climberId = conv.convertToIntegerId(req.params.climberId),
            version = req.params.version;

        if (!auth.validateAuthAndRole(auth.ROLE_ADMIN, req, next)) {
            return;
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
     * Import climbers from an uploaded file
     * URI: data/climbers-upload
     * Method: POST
     * Role: Admin
     * Input:
     *      file CSV file
     *      hasHeader Boolean
     *      action one of "add", "replace", "update", "test"
     *      dateFormat
     *      continueOnErrors
     *      fields , separated list of properties
     * Output: {status: "PARTIAL" | "OK" | "ERROR", stats: stats, errors: errors }
     */
    server.post("data/climbers-upload", function(req,res,next) {
        var i, reason, csvFile, action, fields, columns, hasHeader, dateFormat, continueOnErrors, dupErrors,
            input = req.body;

        csvFile = req.files.file.path;

        if (!auth.validateAuthAndRole(auth.ROLE_ADMIN, req, next)) {
            return;
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
                    [ "usacMemberId", "gender", "category", "region", "team", "coach", "firstName", "lastName", "birthDate"])) {
                return next(new InvalidInput("Unknown field name: " + fields[i]));
            }
        }
        ["usacMemberId", "gender", "category", "firstName", "lastName"].forEach(function(prop) {
            if (fields.indexOf(prop) < 0) {
                return next(new InvalidInput("Fields is missing required field: " + prop));
            }
        });
        // convert fields properties to database columns
        columns = [];
        for (i = 0; i < fields.length; i++) {
            columns.push(climberColumnInfo[fields[i]].column.replace(/^[^.]*\./, "")); // column without table prefix
        }

        function validateClimberRow(climber, addError) {
            var value;

            // usac_member_id is required
            if (!climber.usac_member_id || climber.usac_member_id.length === 0) {
                addError("Missing usacMemberId.");
            }
            climber.usac_member_id = parseInt(climber.usac_member_id, 10);

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

            // last_name is required
            if (!climber.last_name || climber.last_name.length === 0) {
                addError("Missing lastName.");
            }
            ["last_name", "first_name", "region", "team", "coach"].forEach(function(prop) {
                if (climber[prop] && climber[prop].length > 100) {
                    addError("Column " + prop  + " too long");
                }
                if (!climber[prop]) {
                    climber[prop] = null;
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
            // xxx if have date and no category fill in category from date
            //     if have date and category then error? warning? fix category?
            if (climber.region) {
                value = conv.convertToRegion(climber.region);
                if (conv.isInvalid(value)) {
                    addError("Invalid region");
                } else {
                    climber.region = value;
                }
            }
        }

        csvLoader.loadFromCSV(csvFile, hasHeader, fields.length, columns, fields, validateClimberRow, function(err, climbers, total) {
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

            // check for duplicates here because the database will detect and not add duplicates but it can't tell
            // which lines the duplicates came from
            dupErrors = [];
            if (csvLoader.checkDuplicates(climbers, "usac_member_id", dupErrors)) {
                inputErrors = inputErrors.concat(dupErrors);
            }

            if (inputErrors.length > 0 && !continueOnErrors) {
                if (dupErrors.length > 0) {
                    inputErrors.sort(function (a, b) {
                        return a.line - b.line;
                    });
                }
                res.send({status: "ERROR", stats: {
                        added: 0,
                        updated: 0,
                        noChange: 0,
                        notUpdated: 0,
                        totalLines: total,
                        errors: inputErrors.length
                    }, errors: inputErrors });
                next();
                return;
            }

            dbPool.getConnection(function(err, conn) {
                if (err) {
                    return next(err);
                }
                importClimbers(conn, action, columns, climbers, req.authInfo.username, function(err, stats, errors) {
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
                        for (i = 0; i < errors.length; i++) {
                            delete errors[i].item;
                        }
                        stats.totalLines = total;
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
