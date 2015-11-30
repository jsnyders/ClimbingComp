/*
 users.js
 Resources related to users

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
 * Manage users
 *
 * Related tables:
 * - app_user
 * - app_session xxx?
 *
 */

var restify = require("restify");
var auth = require("../auth");
var errors = require("../errors");
var validate = require("../../common/validation");

var InvalidInput = errors.InvalidInput;


//
// Authentication, session and user management
//

function getUser(conn, username, callback) {
    conn.query("SELECT username, version, role, first_name, last_name " +
        "FROM app_user " +
        "WHERE username = ?;", [username], function(err, rows) {
        var user, row;

        if (err) {
            return callback(err, null);
        }

        if (rows.length !== 1) {
            return callback(null, null);
        }

        row = rows[0];
        user = {
            username: row.username,
            version: row.version,
            role: row.role,
            firstName: row.first_name || "",
            lastName: row.last_name || ""
        };
        return callback(err, user);
    });
}

function validateUserInput(input) {
    var reason;

    input.username = input.username.trim();
    reason = validate.usernameString("username", input.username);
    if (reason) {
        return new InvalidInput(reason);
    }
    reason = validate.stringInSet("role", input.role, ["Reader", "Contributor", "Admin"]);
    if (reason) {
        return new InvalidInput(reason);
    }
    input.firstName = (input.firstName || "").trim();
    if (input.firstName === "") {
        input.firstName = null;
    } else {
        reason = validate.stringLength("firstName", input.firstName, 100);
        if (reason) {
            return new InvalidInput(reason);
        }
    }
    input.lastName = (input.lastName || "").trim();
    if (input.lastName === "") {
        input.lastName = null;
    } else {
        reason = validate.stringLength("lastName", input.lastName, 100);
        if (reason) {
            return new InvalidInput(reason);
        }
    }

    return null; // valid
}

function addResources(server, dbPool) {

    /*
     * List all users
     *
     * URI: data/users
     * Method: GET
     * Role: Admin
     * Input: none
     * Output: Collection resource returning user objects
     * xxx real collection resources would support paging, filtering etc
     */
    server.get("data/users", function(req,res,next) {

        if (!auth.validateAuthAndRole(auth.ROLE_ADMIN, req, next)) {
            return;
        }

        dbPool.getConnection(function(err, conn) {
            if (err) {
                return next(err);
            }
            conn.query("SELECT username, first_name, last_name, role, version FROM app_user", function(err, rows) {
                var i, user, row,
                    users = [];

                conn.release();
                if (err) {
                    return next(err);
                }

                for (i = 0; i < rows.length; i++) {
                    row = rows[i];
                    user = {
                        username: row.username,
                        role: row.role,
                        firstName: row.first_name || "",
                        lastName: row.last_name || "",
                        version: row.version
                    };
                    users.push(user);
                }
                res.send({items: users});
                return next();
            });
        });
    });

    /*
     * Create user
     *
     * URI: data/users
     * Method: POST
     * Role: Admin
     * Input is a user object including password property
     * Output: user object without password property
     */
    server.post("data/users", function(req,res,next) {
        var user, reason,
            input = req.body;

        if (!auth.validateAuthAndRole(auth.ROLE_ADMIN, req, next)) {
            return;
        }

        var e = validateUserInput(input);
        if (e) {
            return next(e);
        }
        input.password = (input.password || "").trim();
        reason = validate.passwordString("password", input.password);
        if (reason) {
            return new InvalidInput(reason);
        }

        user = {
            username: input.username,
            first_name: input.firstName,
            last_name: input.lastName,
            role: input.role
        };

        dbPool.getConnection(function(err, conn) {
            if (err) {
                return next(err);
            }

            conn.query("INSERT INTO app_user SET ?, pwd_hash = password(?);", [user, input.password], function(err, result) {
                if (err) {
                    conn.release();
                    if (err.code === "ER_DUP_ENTRY") {
                        return next(new InvalidInput("User exists"));
                    }
                    return next(err);
                }

                getUser(conn, input.username, function(err, user) {
                    conn.release();
                    if (err) {
                        return next(err);
                    }
                    if (!user) {
                        return next(new restify.InternalError("Not created"));
                    }
                    res.header("Location", "/data/users/" + input.username);
                    res.send(user);
                    return next();
                });

            });

        });

    });

    /*
     * Get user
     *
     * URI: data/users/<username>
     * Method: GET
     * Role: Admin
     * Input none
     * Output: user object
     */
    server.get("data/users/:username", function(req,res,next) {
        var reason,
            username = req.params.username;

        if (!auth.validateAuthAndRole(auth.ROLE_ADMIN, req, next)) {
            return;
        }

        reason = validate.usernameString("username", username);
        if (reason) {
            return next(new restify.ResourceNotFoundError(reason));
        }

        dbPool.getConnection(function(err, conn) {
            if (err) {
                return next(err);
            }
            getUser(conn, username, function(err, user) {
                conn.release();
                if (err) {
                    return next(err);
                }
                if (!user) {
                    return next(new restify.ResourceNotFoundError("No such user"));
                }
                res.send(user);
                return next();
            });
        });
    });

    /*
     * Update user
     *
     * URI: data/users/<username>
     * Method: PUT
     * Role: Admin
     * Input user object with values to change including version, username can't be changed
     * Output: user object
     */
    server.put("data/users/:username", function(req,res,next) {
        var user, reason,
            username = req.params.username,
            input = req.body;

        if (!auth.validateAuthAndRole(auth.ROLE_ADMIN, req, next)) {
            return;
        }

        reason = validate.usernameString("username", username);
        if (reason) {
            return next(new restify.ResourceNotFoundError(reason));
        }

        var e = validateUserInput(input);
        if (e) {
            return next(e);
        }

        user = {
            // username can't be changed
            first_name: input.firstName,
            last_name: input.lastName,
            role: input.role
        };

        dbPool.getConnection(function(err, conn) {
            if (err) {
                return next(err);
            }

            conn.query("UPDATE app_user SET ? where username = ? and version = ?;", [user, username, input.version], function(err, result) {
                if (err) {
                    conn.release();
                    return next(err);
                }

                if (result.affectedRows !== 1) {
                    conn.query("SELECT username FROM app_user where username = ?", username, function(err, rows) {
                        conn.release();
                        if (!err) {
                            if (rows.length !== 1) {
                                err = new restify.ResourceNotFoundError("No such user");
                            } else {
                                err = new restify.ConflictError("Stale version");
                            }
                        }
                        return next(err);
                    });
                } else {
                    getUser(conn, username, function(err, user) {
                        conn.release();
                        if (err) {
                            return next(err);
                        }
                        if (!user) {
                            return next(new restify.InternalError("Not found after update"));
                        }
                        res.send(user);
                        return next();
                    });
                }

            });

        });

    });

    /*
     * Update user password
     *
     * URI: data/users/<username>/password
     * Method: PUT
     * Role: Admin
     * Input
     *  {
     *    password: <string>,
     *  }
     * Output:
     *  {
     *    status: "OK"
     *  }
     */
    server.put("data/users/:username/password", function(req,res,next) {
        var reason,
            username = req.params.username,
            input = req.body;

        // admin setting password for user
        if (!auth.validateAuthAndRole(auth.ROLE_ADMIN, req, next)) {
            return;
        }

        reason = validate.usernameString("username", username);
        if (reason) {
            return next(new restify.ResourceNotFoundError(reason));
        }

        input.password = (input.password || "").trim();
        reason = validate.passwordString("password", input.password);
        if (reason) {
            return new InvalidInput(reason);
        }

        dbPool.getConnection(function(err, conn) {
            if (err) {
                return next(err);
            }

            conn.query("UPDATE app_user SET pwd_hash = password(?) where username = ?;", [input.password, username], function(err, result) {
                if (err) {
                    conn.release();
                    return next(err);
                }

                if (result.affectedRows !== 1) {
                        return next(new restify.ConflictError("Failure"));
                } else {
                    res.send({status: "OK"});
                    return next();
                }
            });
        });

    });

    /*
     * Delete user
     * xxx when deleting a user perhaps should delete any sessions that user had?
     *
     * URI: data/users/<username>?version=<n>
     * Method: DELETE
     * Role: Admin
     * Input none
     * Output: none
     */
    server.del("data/users/:username", function(req,res,next) {
        var reason,
            username = req.params.username,
            version = req.params.version;

        if (!auth.validateAuthAndRole(auth.ROLE_ADMIN, req, next)) {
            return;
        }

        reason = validate.usernameString("username", username);
        if (reason) {
            return next(new restify.ResourceNotFoundError(reason));
        }

        if (!version) {
            return next(new restify.ResourceNotFoundError("Version param required"));
        }

        dbPool.getConnection(function(err, conn) {
            if (err) {
                return next(err);
            }

            conn.query("DELETE FROM app_user WHERE username = ? and version = ?;", [username, version], function(err, result) {
                if (err) {
                    conn.release();
                    return next(err);
                }
                if (result.affectedRows !== 1) {
                    conn.query("SELECT username FROM app_user where username=?", username, function(err, rows) {
                        conn.release();
                        if (!err) {
                            if (rows.length !== 1) {
                                err = new restify.ResourceNotFoundError("No such user");
                            } else {
                                err = new restify.ConflictError("Stale version");
                            }
                        }
                        return next(err);
                    });
                } else {
                    res.send(204,"No Content");
                    return next();
                }
            });
        });
    });

    // xxx handle self service case which requires old password
}

module.exports = {
    addResources: addResources
};
