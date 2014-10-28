/*
 htmlFormatter.js
 Very simple formatter for HTML responses. Mostly for 404 errors and basic debugging.

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

var util = require('util');
var escapeHtml = require('./htmlUtils').escapeHtml;

var errorResponse =
    "<!DOCTYPE html>\n" +
    "<html lang='en'>\n" +
    "<head>\n" +
    "<meta charset='utf-8'>\n" +
    "<title>%d - %s</title>\n" +
    "</head>\n<body>\n" +
        "<p>%s</p>" +
        "<a href='/'>Try returning to the beginning...</a>" +
    "</body>\n</html>";

var responseStart =
    "<!DOCTYPE html>\n" +
        "<html lang='en'>\n" +
        "<head>\n" +
        "<meta charset='utf-8'>\n" +
        "<title>Response</title>\n" +
        "</head>\n<body>\n" +
        "<h1>Response for %s</h1>\n";

var responseEnd =
    "</body>\n</html>";


function render(value) {
    if (value === null) {
        return "null";
    } else if (value === true) {
        return "true";
    } else if (value === false) {
        return "false";
    } else if (util.isArray(value)) {
        return renderArray(value);
    } else if (typeof value === "object") {
        return renderObject(value);
    } else if (typeof value === "string") {
        return escapeHtml('"' + value + '"');
    } else if (typeof value === "number") {
        return escapeHtml("" + value);
    } // else
    return "&lt;unknown&gt;";
}

function renderObject(o) {
    var i, key,
        result = "",
        keys = Object.keys(o);

    result += "<div class='object'>Object: <ul>\n";
    for (i = 0; i < keys.length; i++) {
        key = keys[i];
        result += "<li>\"" + escapeHtml(key) + "\": " + render(o[key]) + "</li>\n";
    }
    result += "</ul></div>";
    return result;
}

function renderArray(a) {
    var i, value,
        result = "";

    result += "<div class='array'>Array: <ol>";
    for (i = 0; i < a.length; i++) {
        value = a[i];
        result += "<li>" + render(value) + "</li>";
    }
    result += "</ol></div>";
    return result;
}

module.exports = {
    "text/html; q=0.2": function formatHTML(req, res, body) {
        var path;
        if (body instanceof Error) {
            res.statusCode = body.statusCode || 500;
            body = util.format(errorResponse, res.statusCode, body.body.code, body.body.code + " " + body.body.message);
        } else if (typeof body === 'object') {
            path = req.getPath();
            body = util.format(responseStart, path) + renderObject(body) + responseEnd;
        } else {
            // assume it is already HTML
            body = body.toString();
        }

        res.setHeader('Content-Length', Buffer.byteLength(body));
        return (body);
    }
};

