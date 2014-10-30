/*
 loadClimbers.js
 Utility program to load Climbing Comp database with climbers from a csv file

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
/*jshint node: true, strict: false */

var fs = require('fs');
var csv = require('csv');
var db = require('mysql');

//
// Command line parsing
//
var argv = require('yargs')
    .require(1, "Missing csv-file")
    .alias("config", "c")
    .default("config", "config.json")
    .describe("config", "Configuration file")
    .usage("Usage: $0 [options] csv-file\n" +
            "CSV format:\n" +
            "  Member No., \"First Name\", \"Last Name\", \"Birthdate\", \"Gender\", \"Category\", \"Team Name\", \"Region\" \n" + // xxx location, coach
            "First line assumed to contain column headings and ignored. First and Last Name, Gender, Category,\n" +
            "and Region are required. Extra columns ignored.")
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

var genders = ",Female,Male,",
    categories = ",Masters,Open,Adult,Junior,Youth-A,Youth-B,Youth-C,Youth-D,",
    regions = ",101 (Washington / Alaska),102 (Northwest),103 (Northern California)," +
              "201 (Southern California),202 (Southern Mountain),203 (Colorado)," +
              "301 (Midwest),302 (Ohio River Valley),303 (Mid-Atlantic)," +
              "401 (Heartland),402 (Bayou),403 (Deep South)," +
              "501 (Capital),502 (New England West),503 (New England East),",
    stats = {
        added: 0,
        updated: 0,
        dup: 0
    };

function insert(climber, line, next) {
    var fields = ["gender", "category", "region", "team", "first_name", "last_name", "birth_year"];

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

    dbConnection.query("SELECT id, usac_member_id, first_name, last_name, birth_year, gender, category, region, team " +
                        "FROM climber WHERE usac_member_id = ?;", [climber.usac_member_id], function(err, rows) {
        var i, row, matchIndex, update;

        if (err) {
            throw err;
        }

        if (rows.length !== 0) {
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
                if (climber.usac_member_id !== null && row.usac_member_id === climber.usac_member_id) {
                    matchIndex = i;
                    if (!match(row, climber) || row.first_name !== climber.first_name || row.last_name !== climber.last_name) {
                        console.log("Update climber found by member number '" + climber.first_name + " " + climber.last_name + "' (" + line + ")., updating...");
                        stats.updated += 1;
                        update = true;
                        updateById(row.usac_member_id, getChanges(row, climber));
                    } else {
                        stats.dup += 1;
                    }
                }
            }
            if (!update) {
                next();
            }
        } else {
            console.log("Adding new climber '" + climber.first_name + " " + climber.last_name + "' (" + line + ")., adding...");
            stats.added += 1;
            dbConnection.query("INSERT INTO climber SET version = 1, ?;", climber, function(err, result) {
                if (err) {
                    throw err;
                }
                next();
            });
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
            console.log("Info: Duplicates climbers " + stats.dup + " not added or updated");
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

function yearFromDateString(strdate) {
    var match = /\d+\/\d+\/(\d\d\d\d)\.*/.exec(strdate);
    if (match) {
        return parseInt(match[1], 10);
    } // else
    return null;
}

dbConnection = db.createConnection({
    host: 'localhost',
    user: config.dbUser,
    password: config.dbPassword,
    database: config.dbDatabase
});

dbConnection.connect();

var climbers = [],
    error = false;

csv()
    .from.path("" + argv._[0], { delimiter: ',', escape: '"' })
    .transform(function(row, index) {
        if (index === 0) {
            return null;
        }
        return row;
    })
    .on('record', function(row, index) {
        var climber;

        if (row.length < 8) {
            console.log("Too few columns on line " + index);
            error = true;
            return;
        }

        // last year: "Member No.","First Name","Last Name","Gender","Category","SCS Region","Team Name","Registration: ConfirmedOn"
        // "Member No.","First Name","Last Name","Birthdate","Gender","Category","Team Name","Region"

        climber = {
            usac_member_id: parseInt(row[0], 10) || null,
            first_name: row[1].trim(),
            last_name: row[2].trim(),
            birth_year: yearFromDateString(row[3]),
            gender: row[4],
            category: row[5],
            team: row[6] === "" || row[6].match(/\*None.*/) ? null : row[6],
            region: row[7]
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
