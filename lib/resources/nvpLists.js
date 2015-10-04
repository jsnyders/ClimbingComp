/*
 nvpLists.js
 Resources related to general purpose name value pair lists

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
/* jshint node: true, strict: false */

var restify = require("restify");
var auth = require("../auth");
var conv = require("../conv");
var errors = require("../errors");
var validate = require("../../common/validation");
var util = require("util");

var InvalidInput = errors.InvalidInput;

function getList( dbPool, listName, next ) {
    var query;

    dbPool.getConnection(function (err, conn) {
        if (err) {
            return next(err);
        }
        query = "SELECT val, label, alias FROM nvp WHERE name = ? ORDER BY label";
        conn.query(query, listName, function (err, rows) {
            var i, item, row,
                list = [];

            if (err) {
                conn.release();
                return next(err);
            }

            for (i = 0; i < rows.length; i++) {
                row = rows[i];
                item = {
                    value: row.val,
                    label: row.label,
                    alias: row.alias
                };
                list.push(item);
            }
            return next(null, list);
        });
    });

}

function addResources(server, dbPool) {
    var log = server.log;

    /*
     * Return list of lists
     *
     * URI: data/nvp
     * Method: GET
     * Role: Reader
     * Input: none
     * Output: Collection resource returning list item objects
     */
    server.get("data/nvp", function (req, res, next) {
        var results;

        if (!auth.validateAuthAndRole(auth.ROLE_READER, req, next)) {
            return;
        }

        dbPool.getConnection(function (err, conn) {
            if (err) {
                return next(err);
            }
            conn.query("SELECT DISTINCT name FROM nvp ORDER BY name", function (err, rows) {
                var i, item, row,
                    list = [];

                if (err) {
                    conn.release();
                    return next(err);
                }

                for (i = 0; i < rows.length; i++) {
                    row = rows[i];
                    item = {
                        name: row.name
                    };
                    list.push(item);
                }
                results = {
                    items: list
                };
                res.send(results);
                return next();
            });
        });
    });

    /*
     * Return named list of name value pairs includes an optional alias (short name)
     *
     * URI: data/nvp/<listName>
     * Method: GET
     * Role: Reader
     * Input: none
     * Output: Collection resource returning list item objects
     */
    server.get("data/nvp/:listName", function (req, res, next) {
        var results, query,
            listName = req.params.listName;

        if (!auth.validateAuthAndRole(auth.ROLE_READER, req, next)) {
            return;
        }

        // xxx any validation needed for list name?
        console.log("xxx list name " + listName);

        getList(dbPool, listName, function(err, list) {
            if (err) {
                return next(err);
            }
            results = {
                items: list
            };
            res.send(results);
            return next();
        });
    });

    // todo manage lists, scope lists
}

module.exports = {
    addResources: addResources,
    getList: getList
};
