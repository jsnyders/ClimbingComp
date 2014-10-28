/*
 validation.js
 General data validation functions

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
 * Validation functions return a string giving the reason the validation failed or undefined if the validation
 * is successful.
 * xxx todo
 * xxx how to share modules between client and server the module stuff gets in the way?
 */

var util = require('util');


module.exports = {
    requiredStringLength: function(name, value, maxLen) {
        if (typeof value !== "string" || value.length === 0 || value.length > maxLen) {
            return util.format("%s is required and must be %d or fewer characters", name, maxLen);
        }
    },

    stringLength: function(name, value, maxLen) {
        if (typeof value !== "string" || value.length > maxLen) {
            return util.format("%s must be %d or fewer characters", name, maxLen);
        }
    },

    usernameString: function(name, value) {
        if (typeof value !== "string" || value.length === 0 || value.length > 100 || !/^[a-z_.@A-Z0-9]*$/.test(value)) {
            return util.format("%s must be 100 or fewer alpha numeric or '_', '.', '@' characters", name);
        }
    },

    passwordString: function(name, value) {
        if (typeof value !== "string" || value.length === 0 || value.length > 100 || !/^\S*$/.test(value)) {
            return util.format("%s must be 100 or fewer non white space characters", name);
        }
    },

    stringInSet: function(name, value, values) {
        var i;
        if (typeof value === "string") {
            for (i = 0; i < values.length; i++) {
                if (values[i] === value) {
                    return;
                }
            }
        }
        return util.format("%s must be one of the following: ", name, values.join(", "));
    }

};

