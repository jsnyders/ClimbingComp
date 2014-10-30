/*
 conv.js
 Conversion functions

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
 * todo
 * xxx dates
 */

var ErrorValue = {};

module.exports = {

    isInvalid: function(value) {
        return value === ErrorValue;
    },

    convertToIntegerId: function(value) {
        var val;
        if (/^\d+$/.test("" + value)) {
            val = parseInt(value, 10);
            if (!isNaN(val)) {
                return val;
            }
        }
        return ErrorValue;
    },

    convertToInteger: function(value) {
        var val;
        if (/^\d+$/.test("" + value)) {
            val = parseInt(value, 10);
            if (!isNaN(val)) {
                return val;
            }
        }
        return ErrorValue;
    },

    convertToBool: function(value) {
        value = value.toLowerCase().trim();
        if (value === "true" || value === "yes" || value === "1" || value === "y" || value === "t" ) {
            return true;
        } else if (value === "false" || value === "no" || value === "0" || value === "n" || value === "f" ) {
            return false;
        }
        return ErrorValue;
    },

    toDbBool: function (value) {
        return value ? 1 : 0;
    },

    fromDbBool: function(value) {
        return value !== 0;
    }
};
