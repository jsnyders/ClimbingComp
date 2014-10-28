/*
 errors.js
 Error classes

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

var restify = require("restify");
var util = require("util");


function InvalidInput(message) {
    restify.RestError.call(this, {
        restCode: "InvalidInput",
        statusCode: 400,
        message: message,
        constructorOpt: InvalidInput
    });
    this.name = "InvalidInput";
}
util.inherits(InvalidInput, restify.RestError);

function SessionExpired(message) {
    restify.RestError.call(this, {
        restCode: "SessionExpired",
        statusCode: 401,
        message: message,
        constructorOpt: SessionExpired
    });
    this.name = "SessionExpired";
}
util.inherits(SessionExpired, restify.RestError);

module.exports = {
    InvalidInput: InvalidInput,
    SessionExpired: SessionExpired
};
