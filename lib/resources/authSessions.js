/*
 authSessions.js
 Resources related to authentication sessions

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

/*
 * Resource to "log in" create a session, and "log out" delete a session.
 * See also auth module which verifies the access token on requests.
 * See users module that has resources for managing users.
 *
 * Related tables:
 * - app_session
 * - app_user
 *
 * todo
 * - Consider resource to manage sessions: list, delete, deleteAll?
 * - xxx how to return the auth token header or body, and what format?
 * - How to remove expired sessions from the database
 * - Consider letting node do the sha2 hash rather than the database, could save final select but it is nice being sure the session can be found
 */

var restify = require("restify");
var crypto = require("crypto");
var cookie = require("cookie");

function addResources(server, dbPool) {

    /*
     * Log In
     * After login return the value of access_token in AccessToken header of each request
     *
     * URI:data/sessions
     * Method: POST
     * Input: { username: <string>, password: <string> }
     * Output: { username: <string>, role: <string>, access_token: <string> }
     * xxx should authToken be returned in a header and should there be headers to say never cache the token?
     */
    server.post("data/sessions", function(req,res,next) {
        var input = req.body,
            log = req.log;

        // if logged in log out first but don't wait for it
        if ( req.authInfo && req.authInfo.id ) {
            dbPool.getConnection(function(err, conn) {
                if (err) {
                    log.error("Failed to get connection during login.", err);
                    return;
                }

                conn.query("DELETE FROM app_session WHERE id = ?;", [req.authInfo.id], function(err, result) {
                    conn.release();
                    if (err) {
                        log.error("Failed to delete previous session during login.", err);
                    }
                });
            });
        }

        dbPool.getConnection(function(err, conn) {
            if (err) {
                return next(err);
            }

            conn.query("SELECT username, role FROM app_user WHERE username = ? and pwd_hash = password(?);", [input.username, input.password], function(err, rows) {
                var buffer, row, username, role;
                if (err) {
                    conn.release();
                    return next(err);
                }

                if (rows.length !== 1) {
                    conn.release();
                    return next(new restify.InvalidCredentialsError()); // username and/or password could not be found
                }

                row = rows[0];
                username = row.username;
                role = row.role;
                try {
                    buffer = crypto.randomBytes(64) + new Date().toISOString();
                } catch (ex) {
                    conn.release();
                    log.error("Failed to get random data for session token.", ex);
                    return next(new restify.InternalError()); // 500 but don't expose the reason
                }

                conn.query("INSERT INTO app_session SET session_id=sha2(?,256), username=?, role=?;", [buffer, username, role], function(err, result) {
                    if (err) {
                        conn.release();
                        log.error("Failed to insert session.", err);
                        return next(new restify.InternalError()); // 500 but don't expose the reason
                    }

                    if (result.affectedRows !== 1) {
                        conn.release();
                        log.error("Failed to insert session - affectedRows not 1");
                        return next(new restify.InternalError()); // 500 but don't expose the reason
                    }

                    conn.query("SELECT session_id FROM app_session WHERE id=?;", [result.insertId], function(err, rows) {
                        conn.release();
                        if (err) {
                            log.error("Failed to get token.", err);
                            return next(new restify.InternalError()); // 500 but don't expose the reason
                        }
                        if (rows.length !== 1) {
                            log.error("Failed to get token - rows not 1");
                            return next(new restify.InternalError()); // 500 but don't expose the reason
                        }
                        // xxx cookie name should be a parameter
                        res.setHeader("Set-Cookie", cookie.serialize("ccst", rows[0].session_id)); // xxx options such as httponly
                        res.send({
                            username: username,
                            role: role,
                            access_token: rows[0].session_id
                        });
                        return next();
                    });

                });

            });

        });

    });

    /*
     * Log Out
     *
     * URI:data/sessions/current
     * Method: DELETE
     * Input: none
     * Output: none
     */
    server.del("data/sessions/current", function(req,res,next) {

        if ( req.authInfo && req.authInfo.id ) {
            dbPool.getConnection(function(err, conn) {
                if (err) {
                    return next(err);
                }

                conn.query("DELETE FROM app_session WHERE id = ?;", [req.authInfo.id], function(err, result) {
                    conn.release();
                    if (err) {
                        return next(err);
                    }
                    if (result.affectedRows !== 1) {
                        return next(new restify.ResourceNotFoundError("Not logged in"));
                    } else {
                        res.send(204,"No Content");
                    }
                });
            });
        } else {
            next(new restify.ResourceNotFoundError("Not logged in"));
        }
    });

    // xxx session admin list sessions, delete sessions
}

module.exports = {
    addResources: addResources
};
