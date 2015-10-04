/*
 conv.js
 Conversion functions

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
 * todo
 */

var nvpLists = require("./resources/nvpLists");

var ErrorValue = {};


function zeroPad2(n) {
    n = n + "";
    if (n.length === 1) {
        n = "0" + n;
    }
    return n;
}

// format is mdy or ymd or dmy
function laxParseDate(value, format) {
    var i, m, date,
        year = null,
        month = null,
        day = null;

    if (!/[mdy]{3}/.test(format)) {
        format = "ymd";
    }

    m = /(\d{1,4})[\/\- ](\d{1,4})[\/\- ](\d{1,4})/.exec(value);
    if (m) {
        for (i = 0; i < format.length; i++) {
            if (format[i] === "y") {
                year = parseInt(m[i + 1], 10);
            } else if (format[i] === "m") {
                month = parseInt(m[i + 1], 10);
            } else if (format[i] === "d") {
                day = parseInt(m[i + 1]);
            }
        }
        if (year !== null && month !== null && day !== null) {
            try {
                date = new Date(year +"-" + zeroPad2(month) + "-" + zeroPad2(day) + "T00:00:00Z");
                if (isNaN(date)) {
                    date = null;
                }
            } catch (ex) {
                date = null;
            }
        }
        return date;
    }
    return null;
}

var categoryConversionMap, regionsConversionValues, regionsConversionMap;


module.exports = {

    /*
     * Some conversions are driven by name value pair data from the db.
     * This function should be called before any conversion methods that rely on db metadata and again if the 
     * data changes.
     */
    initConversionData: function(dbPool, next) {
        nvpLists.getList(dbPool, "REGIONS", function(err, list) {
            var i, item;

            if (err) {
                next(err);
            }

            regionsConversionMap = {};
            regionsConversionValues = [];
            for (i = 0; i < list.length; i++) {
                item = list[i];
                regionsConversionValues.push(item.value.toLowerCase().replace(/[() \/-]/g, ""));
                regionsConversionMap[item.alias] = item.value;
            }

            nvpLists.getList(dbPool, "CATEGORIES", function(err, list) {
                var i, item;

                if (err) {
                    next(err);
                }

                categoryConversionMap = {};
                for (i = 0; i < list.length; i++) {
                    item = list[i];
                    categoryConversionMap[item.value.toLowerCase().replace(/[ -]+/g,"")] = item.value;
                    if (item.alias) {
                        categoryConversionMap[item.alias.toLowerCase().replace(/[ -]+/g,"")] = item.value;
                    }
                }

                next();
            });
        });
    },

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
        if (/^[-+]?\d+$/.test("" + value)) {
            val = parseInt(value, 10);
            if (!isNaN(val)) {
                return val;
            }
        }
        return ErrorValue;
    },

    convertToBool: function(value) {
        value = (value || "").toLowerCase().trim();
        if (value === "true" || value === "yes" || value === "1" || value === "y" || value === "t") {
            return true;
        } else if (value === "false" || value === "no" || value === "0" || value === "n" || value === "f") {
            return false;
        }
        return ErrorValue;
    },

    convertToDate: function(value, format) {
        var date;
        date = laxParseDate(value, format);
        if (date) {
            return date;
        }
        return ErrorValue;
    },

    // genders = "Female,Male"
    convertToGender: function(value) {
        value = value.toLowerCase().trim();
        if (value === "female" || value === "f") {
            return "Female";
        } else if (value === "male" || value === "m" ) {
            return "Male";
        }
        return ErrorValue;
    },

    convertToCategory: function(value) {
        value = value.toLowerCase().replace(/[ -]+/g,"");
        value = categoryConversionMap[value];
        if (value) {
            return value;
        }
        return ErrorValue;
    },

    convertToRegion: function(value) {
        var match, r, matchCount,
            num = parseInt(value, 10);

        if (!isNaN(num) && regionsConversionMap[num]) {
            return regionsConversionMap[num];
        } else {
            // try to match by string
            matchCount = 0;
            match = value.toLowerCase().replace(/[() \/-]/g, "");
            regionsConversionValues.forEach(function(r) {
                if (r.indexOf(match) >= 0) {
                    value = regionsConversionMap[parseInt(r, 10)];
                    matchCount += 1;
                }
            });
            if (matchCount !== 1) {
                return ErrorValue;
            }
        }
        return value;
    },

    toDbBool: function (value) {
        return value ? 1 : 0;
    },

    fromDbBool: function(value) {
        return value !== 0;
    }
};
