/*
 static.js
 Serve static file resources

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
var path = require('path');
var restify = require("restify");

function addResources(server, clientRoot, maxAge) {
    var log = server.log;

    function setLastModified(req, res, next) {
        var file = path.join(clientRoot, decodeURIComponent(req.path()));

        fs.stat(file, function (err, stats) {
            if (!err && !stats.isDirectory()) {
                res.set('Last-Modified', stats.mtime);
            }
            next();
        });
    }

    /*
     * Get static resource
     * Supports conditional GET returning 304 not modified if the static file hasn't changed
     *
     * URI: *
     * Method: GET
     * Role: no authentication needed
     * Input: None
     * Output: static file content
     */
    server.get(/.*/, [
        setLastModified,
        restify.conditionalRequest()[2], // just want checkIfModified. This is very dependent on the order of functions returned
        restify.serveStatic({
            directory: clientRoot,
            maxAge: maxAge
        })]
    );
}

module.exports = {
    addResources: addResources
};
