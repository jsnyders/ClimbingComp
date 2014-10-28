/**
 * loadEventClimbers.js
 * Utility program to load Climbing Comp database with climbers for an event from a csv file
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
    csvFile = null,
    replace = false,
    nextClimberNumber = 1000,
    stats = {
        added: 0
    },
    // keep in sync with loadClimbers.js
    genders = ",Female,Male,",
    categories = ",Open,Adult,Junior,Youth-A,Youth-B,Youth-C,Youth-D,",
    regions = ",101 (Washington / Alaska),102 (Northwest),103 (Northern California)," +
        "201 (Southern California),202 (Southern Mountain),203 (Colorado)," +
        "301 (Midwest),302 (Ohio River Valley),303 (Mid-Atlantic)," +
        "401 (Heartland),402 (Bayou),403 (Deep South)," +
        "501 (Capital),502 (New England West),503 (New England East),";

function usage() {
    console.log("Usage:");
    console.log("  node loadEventClimbers.js [-r] event-id csv-file");
    console.log("  node loadEventClimbers.js help | -h");
    console.log("");
    console.log("Option -r will replace all existing climbers. The default is to add climbers.");
    console.log("");
    console.log("CSV format:");
    console.log("  Event Climber No., Member No., \"First Name\", \"Last Name\", \"Gender\", \"Category\", \"Region\", \"Team Name\""); // xxx location, coach, age/bday
    console.log("  First line assumed to contain column headings and ignored. Extra columns ignored." );
    console.log("  Only Member No. or First and Last Name are required if the climber already exists in the master list.");
    console.log("  Otherwise First and Last Name, Category are required and climber is added to master list.");
    console.log("  CSV file must contain all climbers as any existing climbers for that event are overwritten.");
}

function stringInSet(string, values) {
    return values.indexOf("," + string + ",") >= 0;
}

function clearEventClimbers(eventId, next) {
    console.log("Info: Clear previous event climbers.");
    dbConnection.query("DELETE FROM event_climber WHERE event_id = ?;", eventId, function(err, result) {
        if (err) {
            throw err;
        }
        next();
    });
}

function insertEventClimber(climber, line, next) {
    var fields = ["gender", "category", "region", "team", "first_name", "last_name"];

    function match(a, b) {
        return a.gender === b.gender && a.category === b.category && (a.region === b.region || !b.region)&& (a.team === b.team || !b.team);
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
            number: climber.number // xxxnextClimberNumber
        };

        // xxxnextClimberNumber += 1;

        dbConnection.query("INSERT INTO event_climber SET ?;", eventClimber, function(err, result) {
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

    dbConnection.query("SELECT id, usac_member_id,first_name,last_name,gender,category,ifnull(region,'') as region,ifnull(team,'') as team " +
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
                if (climber.region) {
                    newClimber.region =  climber.region;
                }
                if (climber.team) {
                    newClimber.team = climber.team;
                }

                dbConnection.query("INSERT INTO climber SET ?;", newClimber, function(err, result) {
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
            update = false;
            // update information
            for (i = 0; i < rows.length; i++) {
                row = rows[i];

                if (matchIndex >= 0) {
                    console.log("Error: Climber '" + climber.first_name + " " + climber.last_name + "' (" + line + ") found multiple matches");
                    next();
                    return;
                }

                // first check if match by member number then match by name
                if (climber.usac_member_id !== null && row.usac_member_id == climber.usac_member_id) {
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

if (args.length >= 1 && (args[0] === "help" || args[0] === "-h")) {
    usage();
    process.exit();
}

if (args.length >= 1 && args[0] === "-r") {
    args.shift();
    replace = true;
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
        usage();
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
            // "Member No.","First Name","Last Name","Gender","Category","SCS Region","Team Name"
            climber = {
                number: row[0],
                usac_member_id: row[1] || null,
                first_name: row[2].trim(),
                last_name: row[3].trim(),
                event_id: eventId
            };
            if (row.length >= 5) {
                climber.gender = row[4];
            }
            if (row.length >= 6) {
                climber.category = row[5];
            }
            if (row.length >= 7) {
                climber.region = row[6];
            }
            if (row.length >= 8) {
                climber.team = row[7].match(/\*None.*/) ? null : row[7];
            }
            if (!(climber.first_name && climber.last_name)) {
                logError("Error: Invalid input on line " + index + ". Missing first or last name.");
            }
            if (climber.gender && !stringInSet(climber.gender, genders)) {
                logError("Error: Invalid input on line " + index + ". Invalid gender: " + climber.gender + ".");
            }
            if (climber.category && !stringInSet(climber.category, categories)) {
                logError("Error: Invalid input on line " + index + ". Invalid category: " + climber.category + ".");
            }
            if (climber.region && !stringInSet(climber.region, regions)) {
                logError("Error: Invalid input on line " + index + ". Invalid region: " + climber.region + ".");
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
//            console.log("xxx climber: " + climber.usac_member_id + ", " + climber.first_name + ", " + climber.last_name);
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

