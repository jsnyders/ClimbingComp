/*
 auth.js
 Authentication utilities

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
 * This module contains utilities to verify that a request is authenticated and authorized based on role.
 * It also has a plugin authCheck to use to check the request authentication. The authCheck
 * must run before any routes. See module resources/authSession for resources that create and remove
 * sessions (login, logout).
 *
 * Related tables:
 * - app_session
 *
 * todo
 * - Consider other types of authentication
 *   The thing I don't like about JSON web tokens (JWT) is no explicit logout
 *   See http://stackoverflow.com/questions/21978658/invalidating-json-web-tokens
 * - Consider other types of authorization
 * - xxx what should header name and format be?
 *   Authorization: Bearer <token>
 *   See https://tools.ietf.org/html/rfc6750
 * - Consider allowing token from a query parameter or form post data access_token
 * - Consider using cookies benefit of cokies is the don't require session storage and have some protection from JavaScript access.
 *   They will get sent for static resources as well.
 * - Measure the real overhead of going to the db for checking the session
 * - Consider caching sessions in memory, still need to write through the access time,
 *   the problem is in handling deleted sessions, need to go back to the db every so often,
 */

var restify = require("restify");
var errors = require("./errors");

var ROLE_LEVEL = {
    Admin: 3,
    Contributor: 2,
    Reader: 1
};

var gSessionMaxTime = 1 * 60 * 60, // 1hr
    gSessionIdleTime = 5 * 60; // 5 min

module.exports = {
    ROLE_ADMIN: "Admin",
    ROLE_READER: "Reader",
    ROLE_CONTRIBUTOR: "Contributor",

    getRoleLevel: function(role) {
        return ROLE_LEVEL[role] || -1;
    },

    validateAuthAndRole: function( role, req, next ) {
        var aRoleLevel, roleLevel;
        if (req.authInfo) {
            aRoleLevel = this.getRoleLevel(req.authInfo.role);
            roleLevel = this.getRoleLevel(role);
            if (aRoleLevel > 0 && roleLevel > 0 && aRoleLevel >= roleLevel ) {
                return true;
            }
            next(new restify.NotAuthorizedError());
        } else {
            next(new restify.InvalidCredentialsError()); // xxx send challenge?
        }
        return false;
    },

    validateAuth: function ( req, next ) {
        if (req.authInfo) {
            if (req.authInfo.role) {
                return true;
            }
            next(new restify.NotAuthorizedError());
        } else {
            next(new restify.InvalidCredentialsError()); // xxx send challenge?
        }
        return false;
    },

    setTimeLimits: function(sessionMaxTime, sessionIdleTime) {
        gSessionMaxTime = sessionMaxTime;
        gSessionIdleTime = sessionIdleTime;
    },

    /*
     * Usage:
     *   var auth = require("./auth");
     *   server.use(auth.authCheck(dbPool, sessionMaxTime, sessionIdleTime));
     */
    authCheck: function(dbPool, sessionMaxTime, sessionIdleTime) {
        if (sessionMaxTime) {
            gSessionMaxTime = sessionMaxTime;
        }
        if (sessionIdleTime) {
            gSessionIdleTime = sessionIdleTime;
        }
        return function(req,res,next) {
            var token = req.header("AccessToken"); // xxx access token

            req.log.debug("Auth check received token: " + (token ? token : "none"));
            if ( token ) {
                dbPool.getConnection(function(err, conn) {
                    if (err) {
                        return next(err);
                    }
                    conn.query("SELECT id, username, role, to_seconds(now()) - to_seconds(created_on) as total_time, to_seconds(now()) - to_seconds(accessed_on) as idle_time " +
                        "FROM app_session WHERE session_id = ?;", [token], function(err, rows) {
                        var row, totalTtl, ttl;

                        if (err) {
                            conn.release();
                            req.log.error("Failed to lookup token", err);
                            return next(new restify.InvalidCredentialsError());
                        }

                        if ( rows.length === 1 ) {
                            row = rows[0];
                            totalTtl = gSessionMaxTime - row.total_time;
                            ttl = gSessionIdleTime - row.idle_time;

                            console.log("xxx total time for session: " + row.total_time + ", " + totalTtl);
                            console.log("xxx idle time for session : " + row.idle_time + ", " + ttl);

                            // check if session has expired
                            if (ttl < 0 || totalTtl < 0) {
                                // session has expired so delete it but don't wait
                                conn.query("DELETE FROM app_session WHERE id = ?;", [row.id], function(err, result) {
                                    conn.release();
                                    if (err) {
                                        req.log.error("Failed to delete expired session.", err);
                                    }
                                });
                                return next(new errors.SessionExpired("Session Expired")); // not authenticated because session expired
                            }
                            // else

                            // update last access time but don't wait
                            conn.query("UPDATE app_session SET accessed_on=now() WHERE id = ?;", [row.id], function(err, result) {
                                conn.release();
                                if (err) {
                                    req.log.error("Failed to update session last access time.", err);
                                }
                            });

                            // authenticated
                            req.authInfo = {
                                role: row.role,
                                username: row.username,
                                total_ttl: totalTtl,
                                ttl: ttl,
                                id: row.id
                            };
                            return next();

                        } else {
                            conn.release();
                            return next(new restify.InvalidCredentialsError()); // not authenticated because token is bogus
                        }
                    });
                });
            } else {
                next(); // not authenticated because there is no token
            }
        };
    }
};
