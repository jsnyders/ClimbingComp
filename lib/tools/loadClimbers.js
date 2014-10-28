/**
 * loadClimbers.js
 * Utility program to load Climbing Comp database with climbers from a csv file
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
    genders = ",Female,Male,",
    categories = ",Open,Adult,Junior,Youth-A,Youth-B,Youth-C,Youth-D,",
    regions = ",101 (Washington / Alaska),102 (Northwest),103 (Northern California)," +
              "201 (Southern California),202 (Southern Mountain),203 (Colorado)," +
              "301 (Midwest),302 (Ohio River Valley),303 (Mid-Atlantic)," +
              "401 (Heartland),402 (Bayou),403 (Deep South)," +
              "501 (Capital),502 (New England West),503 (New England East),",
    stats = {
        added: 0,
        updated: 0
    };

function usage() {
    console.log("Usage:");
    console.log("  node loadClimbers.js csv-file | help | -h");
    console.log("");
    console.log("CSV format:");
    console.log("  Member No., \"First Name\", \"Last Name\", \"Gender\", \"Category\", \"Region\", \"Team Name\""); // xxx location, coach, age/bday
    console.log("  First line assumed to contain column headings and ignored. First and Last Name, Gender, Category,");
    console.log("  and Region are required. Extra columns ignored.");
}

function insert(climber, line, next) {
    var fields = ["gender", "category", "region", "team", "first_name", "last_name"];

    function match(a, b) {
        return a.gender === b.gender && a.category === b.category && a.region === b.region && a.team === b.team;
    }

    function getChanges(a, b) {
        var i, f,
            changes = {},
            updates = "";

        for (i = 0; i < fields.length; i++) {
            f = fields[i];
            if (a[f] !== b[f]) {
                changes[f] = b[f];
                updates += " " + f;
            }
        }
        console.log("   changed fields:" + updates);
        return changes;
    }

    function updateById(id, climber) {
        dbConnection.query("UPDATE climber SET ? WHERE usac_member_id = ?;", [climber, id], function(err, result) {
            if (err) {
                throw err;
            }
            next();
        });
    }

    function updateByName(first, last, climber) {
        dbConnection.query("UPDATE climber SET ? WHERE first_name = ? AND last_name = ?;", [climber, first, last], function(err, result) {
            if (err) {
                throw err;
            }
            next();
        });
    }

    dbConnection.query("SELECT id, usac_member_id, first_name, last_name, gender, category, region, team " +
                        "FROM climber WHERE (first_name = ? AND last_name = ?) OR usac_member_id = ?;",
                        [climber.first_name, climber.last_name, climber.usac_member_id], function(err, rows) {
        var i, row, matchIndex, update;

        if (err) {
            throw err;
        }

        if (rows.length === 0) {
            console.log("Adding new climber '" + climber.first_name + " " + climber.last_name + "' (" + line + ")., adding...");
            stats.added += 1;
            dbConnection.query("INSERT INTO climber SET ?;", climber, function(err, result) {
                if (err) {
                    throw err;
                }
                next();
            });
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
                        console.log("Update climber found by member number '" + climber.first_name + " " + climber.last_name + "' (" + line + ")., updating...");
                        stats.updated += 1;
                        update = true;
                        updateById(row.usac_member_id, getChanges(row, climber));
                    }
                } else if ( row.first_name === climber.first_name && row.last_name === climber.last_name) {
                    matchIndex = i;
                    if (!match(row, climber)) {
                        console.log("Update climber found by name '" + climber.first_name + " " + climber.last_name + "' (" + line + ")., updating...");
                        stats.updated += 1;
                        update = true;
                        updateByName(row.first_name, row.last_name, getChanges(row, climber));
                    }
                }
            }
            if (!update) {
                next();
            }
        }
    });

}

function processClimbers(climbers) {
    var i, climber, line;

    function nextClimber() {
        if (i >= climbers.length) {
            console.log("Info: Processed " + climbers.length + " climbers in input file");
            console.log("Info: Added " + stats.added + " climbers");
            console.log("Info: Updated " + stats.updated + " climbers");
            dbConnection.end();
        } else {
            climber = climbers[i].data;
            line = climbers[i].line;
            insert(climber, line, function() {
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
    nextClimber();
}

function stringInSet(string, values) {
    return values.indexOf("," + string + ",") >= 0;
}

if (args.length !== 1) {
    console.log("Missing input csv file");
    usage();
    process.exit();
}

if (args[0] === "help" || args[0] === "-h") {
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

var climbers = [],
    error = false;

csv()
    .from.path(args[0], { delimiter: ',', escape: '"' })
    .transform(function(row, index) {
        if (index === 0) {
            return null;
        }
        return row;
    })
    .on('record', function(row, index) {
        var climber;

        if (row.length < 7) {
            console.log("Too few columns on line " + index);
            return;
        }

        // "Member No.","First Name","Last Name","Gender","Category","SCS Region","Team Name","Registration: ConfirmedOn"
        climber = {
            usac_member_id: row[0] || null,
            first_name: row[1],
            last_name: row[2],
            gender: row[3],
            category: row[4],
            region: row[5],
            team: row[6] === "" || row[6].match(/\*None.*/) ? null : row[6]
        };
        if (!(climber.first_name && climber.last_name)) {
            console.log("Error: Invalid input on line " + index + ". Missing first or last name.");
            error = true;
        }
        if (!stringInSet(climber.gender, genders)) {
            console.log("Error: Invalid input on line " + index + ". Invalid gender: " + climber.gender + ".");
            error = true;
        }
        if (!stringInSet(climber.category, categories)) {
            console.log("Error: Invalid input on line " + index + ". Invalid category: " + climber.category + ".");
            error = true;
        }
        if (!stringInSet(climber.region, regions)) {
            console.log("Error: Invalid input on line " + index + ". Invalid region: " + climber.region + ".");
            error = true;
        }
        if (!error) {
            climbers.push({data: climber, line: index});
        }
    })
    .on('end', function(/*count*/) {
        if (!error) {
            processClimbers(climbers);
        } else {
            console.log("There were errors in CSV input so no climbers loaded");
            dbConnection.end();
        }
    })
    .on('error', function(error) {
        console.log("Error processing CSV input: " + error.message);
        dbConnection.end();
    });
