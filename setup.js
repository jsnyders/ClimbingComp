/*
 setup.js
 Setup steps for ClimbingComp.

 Copyright (c) 2015, John Snyders

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

/*
 * Setup steps for ClimbingComp.
 * This creates the database, a database user and writes the config.json file.
 */

var fs = require("fs");
var db = require("mysql");
var prompt = require("prompt");

prompt.colors = false;
prompt.message = "";
prompt.delimiter = "";
prompt.start();

console.log("ClimbingComp Setup\n");
console.log("This setup program will create the MariaDB or MySQL database and create a database user that the web");
console.log("server uses to access the database. MariaDB or MySQL must be installed and running on the specified host.");
console.log("You must provide the username and password of an admin database user that has privileges to create");
console.log("databases, users, and triggers.\n");
console.log("The admin username and password will not be stored. The host, climbing comp database, username and");
console.log("password will be stored in config.json.\n");
prompt.get([
        {
            name: "dbHost",
            message: "Database Host: ",
            default: "localhost",
            required: true
        },
        {
            name: "dbInstallUser",
            message: "Database Admin Username: ",
            default: "root",
            required: true
        },
        {
            name: "dbInstallPwd",
            message: "Database Admin Password: ",
            hidden: true,
            required: true
        },
        {
            name: "database",
            message: "Database: ",
            default: "climbing_comp",
            required: true
        },
        {
            name: "user",
            message: "Database Username: ",
            default: "climbing_user",
            required: true
        },
        {
            name: "password",
            message: "Database Password: ",
            hidden: true,
            required: true
        }
    ], function(err, result) {
        var options;

        if (err) {
            console.log("Error gathering input: " + err.message );
            process.exit(1);
        }
        options = {
            host: result.dbHost,
            database: result.database,
            user: result.user,
            password: result.password
        };
        processDBScript(result.dbHost, result.dbInstallUser, result.dbInstallPwd, options, "db/createdb.sql");
    });

function processDBScript(host, admin, adminPwd, options, file) {
    var conn, script;

    try {
        script = fs.readFileSync(file, 'utf8');
    } catch (ex) {
        console.log("Error reading '" + file + "'. Reason: " + ex.message);
        process.exit(1);
    }
    // default db engine
    options.engine = "MyISAM";

    conn = db.createConnection({
        host: host,
        user: admin,
        password: adminPwd
    });

    conn.connect(function(err) {
        if (err) {
            console.log("Error connecting to database on '" + host + "' as '" + admin + "'. Reason: " + err.message);
            process.exit(1);
        }

        conn.query("SHOW ENGINES;", function(err, results) {
            var i, lines;
            if (err) {
                console.log("Warning: Failed to enumerate database storage engines. Will use 'MyISAM'. Reason: " + err.message);
            } else {
                for (i = 0; i < results.length; i++) {
                    if ( results[i].Engine === "Aria" && results[i].Support === "YES" ) {
                        options.engine = "Aria";
                    }
                }
            }
            script = script.replace(/{{([a-zA-Z0-9]+)}}/g, function(m, key) {
                var value = options[key];
                if (!value) {
                    console.log("Error parsing " + file + ". Unknown token " + m);
                    process.exit(1);
                }
                return value;
            });

            // get confirmation before making any changes
            console.log("\nSetup is now ready to create the database on host " + host + " logging in as " + admin + ".");
            console.log("Database '" + options.database + "' (using storage engine " + options.engine +
                        ") will be created and\nany existing database by that name will be overwritten.");
            console.log("User '" + options.user + "'@'" + options.host + "' will be created and granted all rights to " + options.database + ".");
            console.log("Any existing user by that name will be overwritten.");
            console.log("Database connection information including the password for user '" + options.user + "' will written to config.json.\n");
            prompt.get([
                    {
                        name: "continue",
                        message: "Enter Y to proceed or N to exit: ",
                        default: "Y",
                        required: true
                    }
                ], function(err, result) {
                    if (err) {
                        console.log("Error gathering input: " + err.message );
                        process.exit(1);
                    }
                    if ( result.continue.toUpperCase() === "Y" ) {
                        lines = script.split("\n");
                        executeDbScript(conn, lines, function() {
                            saveConfig(options);
                        });
                    } else {
                        console.log("Setup exiting with no changes made.");
                        process.exit(1);
                    }
                });
        });
    });
}

function executeDbScript(conn, lines, next) {
    var curLine = 0;

    function getStatement() {
        var i, line,
            statement = "";

        for (i = curLine; i < lines.length; i++) {
            line = lines[i];
            line = line.replace(/--.*$/, "")
            if (line.trimLeft().length === 0) {
                continue;
            }
            statement += line + "\n";
            if (/;\s*$/.test(line)) {
                break;
            }
        }
        curLine = i + 1;
        return statement;
    }

    function executeNext() {
        var line, statement;

        statement = getStatement();

        if (curLine >= lines.length) {
            conn.end(function (err) {
                console.log("Database created.");
                next();
            });
            return;
        }

        conn.query(statement, function(err, results) {
            if (err) {
                // ignore errors for drop user
                if (!/DROP USER/i.test(statement)) {
                    console.log("Failed to execute statement: " + statement);
                    console.log("  Reason: " + err.message);
                    process.exit(1);
                }
            }
            // TODO consider adding verbose output with results here
            // console.log("results: ", results);
            executeNext();
        });

    }

    executeNext();
}

function saveConfig(options) {
    var config = {
        dbHost: options.host,
        dbDatabase: options.database,
        dbUser: options.user,
        dbPassword: options.password
    };

    try {
        fs.writeFileSync("config.json", JSON.stringify(config, null, 4), { mode: 0660, encoding: "utf-8", flag: "w"});
    } catch (ex) {
        console.log('Failed create config.json. Reason: ' + ex.message);
        process.exit(1);
    }
    console.log("Config file config.json created.");
    console.log("Climbing Comp setup complete! Use 'npm start' to start the web server.");
}