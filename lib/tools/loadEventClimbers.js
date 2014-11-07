/*
 loadEventClimbers.js
 Utility program to load Climbing Comp database with climbers for an event from a csv file

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

var fs = require('fs');
var csv = require('csv');
var db = require('mysql');
var conv = require('../conv');

//
// Command line parsing
//
var argv = require('yargs')
    .require(2, "Missing required parameters event-id and csv-file")
    .boolean("replace")
    .alias("replace", "r")
    .describe("replace", "Replace all existing climbers. The default is to add climbers.")
    .alias("config", "c")
    .default("config", "config.json")
    .describe("config", "Configuration file")
    .usage("Usage: $0 [options] event-id csv-file\n" +
        "CSV format:\n" +
        "  Event Climber No., Member No., \"First Name\", \"Last Name\", \"Birthdate\", \"Gender\", \"Category\", \"Region\", \"Team Name\"\n" + // xxx location, coach,
        "First line assumed to contain column headings and ignored. Extra columns ignored.\n" +
        "Only Member No. or First and Last Name are required if the climber already exists in the master list.\n" +
        "Otherwise First and Last Name, Category are required and climber is added to master list.")
    .wrap(78)
    .strict()
    .help("help", "Display usage")
    .alias("help", "h")
    .argv;

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

var dbConnection;

var eventId = conv.convertToInteger(argv._[0]),
    csvFile = "" + argv._[1],
    replace = argv.replace,
    stats = {
        added: 0
    };

function yearFromDateString(strdate) {
    var match = /\d+\/\d+\/(\d\d\d\d)\.*/.exec(strdate);
    if (match) {
        return parseInt(match[1], 10);
    } // else
    return null;
}

function clearEventClimbers(eventId, next) {
    console.log("Info: Clear previous event climbers.");
    dbConnection.query("DELETE FROM event_climber WHERE event_id = ?;", eventId, function(err /*, result*/) {
        if (err) {
            throw err;
        }
        next();
    });
}

function insertEventClimber(climber, line, next) {
    var fields = ["gender", "category", "region", "team", "first_name", "last_name", "birth_year"];

    function match(a, b) {
        return a.gender === b.gender && a.category === b.category && (a.region === b.region || !b.region) && (a.team === b.team || !b.team);
    }

    function getChanges(a, b) {
        var i, f,
            changes = {}, // xxx not currently used
            updates = "";

        for (i = 0; i < fields.length; i++) {
            f = fields[i];
            if (a[f] !== b[f] && b[f]) {
                changes[f] = b[f];
                updates += " " + f + " (database) " + a[f] + "!= (input)" + b[f];
            }
        }
        console.log("   fields:" + updates);
        return changes;
    }

    function insertInEvent(climber, id) {
        var eventClimber = {
            climber_id: id,
            event_id: climber.event_id,
            number: climber.number
        };

        dbConnection.query("INSERT INTO event_climber SET version = 1, ?;", eventClimber, function(err /*, result*/) {
            if (err) {
                if (err.code === "ER_DUP_ENTRY") {
                    console.log("Duplicate climber not entered: Member ID: " +
                        climber.usac_member_id + ", Name: " + climber.first_name + " " + climber.last_name);
                } else {
                    throw err;
                }
            } else {
                stats.added += 1;
            }
            next();
        });
    }

    dbConnection.query("SELECT id, usac_member_id,first_name,last_name,birth_year,gender,category,ifnull(region,'') as region,ifnull(team,'') as team " +
                           "FROM climber WHERE (first_name = ? AND last_name = ?) OR usac_member_id = ?;",
                        [climber.first_name, climber.last_name, climber.usac_member_id], function(err, rows) {
        var i, row, newClimber, matchIndex, update;

        if (err) {
            throw err;
        }

        if (rows.length === 0) {
            if (climber.gender && climber.category) {
                console.log("Climber not found '" + climber.first_name + " " + climber.last_name + "' (" + line + ")., adding...");
                newClimber = {
                    usac_member_id: climber.usac_member_id,
                    first_name: climber.first_name,
                    last_name: climber.last_name,
                    gender: climber.gender,
                    category: climber.category
                };
                if ( climber.birth_year ) {
                    newClimber.birth_year = climber.birth_year;
                    newClimber.birth_date = climber.birth_date;
                }
                if (climber.region) {
                    newClimber.region =  climber.region;
                }
                if (climber.team) {
                    newClimber.team = climber.team;
                }

                dbConnection.query("INSERT INTO climber SET version = 1, ?;", newClimber, function(err, result) {
                    if (err) {
                        throw err;
                    }
                    insertInEvent(climber, result.insertId);
                });
            } else {
                console.log("Error: Climber not found '" + climber.first_name + " " + climber.last_name + "' (" + line + "). Can't add because gender, and category missing from input");
                next();
            }
        } else {
            matchIndex = -1;
            // update information
            for (i = 0; i < rows.length; i++) {
                row = rows[i];

                if (matchIndex >= 0) {
                    console.log("Error: Climber '" + climber.first_name + " " + climber.last_name + "' (" + line + ") found multiple matches");
                    next();
                    return;
                }

                // first check if match by member number then match by name
                if (climber.usac_member_id !== null && row.usac_member_id === climber.usac_member_id) {
                    matchIndex = i;
                    if (!match(row, climber) || row.first_name !== climber.first_name || row.last_name !== climber.last_name) {
                        console.log("Adding climber but not updating master list for climber found by member number '" + climber.first_name + " " + climber.last_name + "' (" + line + ")., Differences:");
                        getChanges(row, climber);
                    }
                } else if ( row.first_name === climber.first_name && row.last_name === climber.last_name) {
                    matchIndex = i;
                    if (!match(row, climber)) {
                        console.log("Adding climber but not updating master list for climber found by name '" + climber.first_name + " " + climber.last_name + "' (" + line + ")., Differences:");
                        getChanges(row, climber);
                    }
                }
            }
            if (matchIndex >= 0) {
                insertInEvent(climber, rows[matchIndex].id);
            } else {
                next();
            }
        }
    });
}


if (conv.isInvalid(eventId)) {
    console.log("Invalid event-id. Must be a number.");
    process.exit();
}

dbConnection = db.createConnection({
    host: 'localhost',
    user: config.dbUser,
    password: config.dbPassword,
    database: config.dbDatabase
});

dbConnection.connect();

dbConnection.query("SELECT id,location FROM event WHERE id = ?;", eventId, function(err, rows) {
    if (err) {
        throw err;
    }
    if (rows.length === 1) {
        console.log("Found event " + rows[0].id + " at " + rows[0].location );
        loadClimbers(processClimbers);
    } else {
        dbConnection.end();
        console.log("Event with event-id " + eventId + " not found.");
        process.exit();
    }
});

function loadClimbers(next) {
    var climbers = [],
        error = false;

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
            var climber;

            if (row.length < 4) {
                logError("Too few columns on line " + index);
                return;
            }
            // Number, Member No.,"First Name","Last Name","Birth Date","Gender","Category","SCS Region","Team Name"
            climber = {
                number: parseInt(row[0], 10),
                usac_member_id: parseInt(row[1]) || null,
                first_name: row[2].trim(),
                last_name: row[3].trim(),
                event_id: eventId
            };
            if (row.length >= 5 && row[4]) {
                climber.birth_year = yearFromDateString(row[4]);
                climber.birth_date = new Date(row[4]);
            }
            if (row.length >= 6) {
                climber.gender = conv.convertToGender(row[5].trim());
            }
            if (row.length >= 7) {
                climber.category = conv.convertToCategory(row[6].trim());
            }
            if (row.length >= 8 && row[7]) {
                climber.region = conv.convertToRegion(row[7].trim());
            }
            if (row.length >= 9) {
                climber.team = row[8].match(/\*None.*/) ? null : row[8].trim();
            }
            if (!(climber.first_name && climber.last_name)) {
                logError("Error: Invalid input on line " + index + ". Missing first or last name.");
            }
            if (climber.gender && conv.isInvalid(climber.gender)) {
                logError("Error: Invalid input on line " + index + ". Invalid gender: " + row[4] + ".");
            }
            if (climber.category && conv.isInvalid(climber.category)) {
                logError("Error: Invalid input on line " + index + ". Invalid category: " + row[5] + ".");
            }
            if (climber.region && conv.isInvalid(climber.region)) {
                logError("Error: Invalid input on line " + index + ". Invalid region: " + row[6] + ".");
            }

            climbers.push(climber);
        })
        .on('end', function(/*count*/) {
            if (!error) {
                next(climbers);
            } else {
                dbConnection.end();
            }
        })
        .on('error', function(error) {
            console.log("Error processing CSV input: " + error.message);
            dbConnection.end();
        });
}

function processClimbers(climbers) {
    var i, climber;

    function nextClimber() {
        if (i >= climbers.length) {
            console.log("Info: Processed " + climbers.length + " climbers from input file");
            console.log("Info: Added " + stats.added + " climbers");
            dbConnection.end();
        } else {
            climber = climbers[i];
            insertEventClimber(climber, i, function() {
                i += 1;
                nextClimber();
            });
        }
    }

    if (climbers.length === 0) {
        console.log("Error no climbers to add");
        dbConnection.end();
        return;
    }

    i = 0;
    if (replace) {
        clearEventClimbers(climbers[0].event_id, function() {
            nextClimber();
        });
    } else {
        nextClimber();
    }

}

