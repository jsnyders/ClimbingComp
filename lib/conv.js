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

/* parseDate adapted from jQuery UI datepicker:parseDate*/
/* xxx this is way to strict */
var parseDateDefaults = {
    shortYearCutoff: "+10", // Short year values < this are in the current century,
        // > this are in the previous century,
        // string value starting with "+" for current year + value
    monthNames: ["January","February","March","April","May","June",
        "July","August","September","October","November","December"], // Names of months for drop-down and formatting
    monthNamesShort: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], // For formatting
    dayNames: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], // For formatting
    dayNamesShort: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] // For formatting
};

var ticksTo1970 = (((1970 - 1) * 365 + Math.floor(1970 / 4) - Math.floor(1970 / 100) + Math.floor(1970 / 400)) * 24 * 60 * 60 * 10000000);

function daylightSavingAdjust(date) {
    if (!date) {
        return null;
    }
    date.setHours(date.getHours() > 12 ? date.getHours() + 2 : 0);
    return date;
}

/* Parse a string value into a date object.
 * See formatDate below for the possible formats.
 *
 * @param  format string - the expected format of the date
 * @param  value string - the date in the above format
 * @param  settings Object - attributes include:
 *					shortYearCutoff  number - the cutoff year for determining the century (optional)
 *					dayNamesShort	string[7] - abbreviated names of the days from Sunday (optional)
 *					dayNames		string[7] - names of the days from Sunday (optional)
 *					monthNamesShort string[12] - abbreviated names of the months (optional)
 *					monthNames		string[12] - names of the months (optional)
 * @return  Date - the extracted date value or null if value is blank
 */
function parseDate(format, value, settings) {

    value = (typeof value === "object" ? value.toString() : value + "");
    if (value === "") {
        return null;
    }

    var iFormat, dim, extra,
        iValue = 0,
        shortYearCutoffTemp = (settings ? settings.shortYearCutoff : null) || parseDateDefaults.shortYearCutoff,
        shortYearCutoff = (typeof shortYearCutoffTemp !== "string" ? shortYearCutoffTemp :
            new Date().getFullYear() % 100 + parseInt(shortYearCutoffTemp, 10)),
        dayNamesShort = (settings ? settings.dayNamesShort : null) || parseDateDefaults.dayNamesShort,
        dayNames = (settings ? settings.dayNames : null) || parseDateDefaults.dayNames,
        monthNamesShort = (settings ? settings.monthNamesShort : null) || parseDateDefaults.monthNamesShort,
        monthNames = (settings ? settings.monthNames : null) || parseDateDefaults.monthNames,
        year = -1,
        month = -1,
        day = -1,
        doy = -1,
        literal = false,
        date,
    // Check whether a format character is doubled
        lookAhead = function(match) {
            var matches = (iFormat + 1 < format.length && format.charAt(iFormat + 1) === match);
            if (matches) {
                iFormat++;
            }
            return matches;
        },
    // Extract a number from the string value
        getNumber = function(match) {
            var isDoubled = lookAhead(match),
                size = (match === "@" ? 14 : (match === "!" ? 20 :
                    (match === "y" && isDoubled ? 4 : (match === "o" ? 3 : 2)))),
                digits = new RegExp("^\\d{1," + size + "}"),
                num = value.substring(iValue).match(digits);
            if (!num) {
                throw "Missing number at position " + iValue;
            }
            iValue += num[0].length;
            return parseInt(num[0], 10);
        },
    // Extract a name from the string value and convert to an index
        getName = function(match, shortNames, longNames) {
            var index = -1,
                names = $.map(lookAhead(match) ? longNames : shortNames, function (v, k) {
                    return [ [k, v] ];
                }).sort(function (a, b) {
                    return -(a[1].length - b[1].length);
                });

            $.each(names, function (i, pair) {
                var name = pair[1];
                if (value.substr(iValue, name.length).toLowerCase() === name.toLowerCase()) {
                    index = pair[0];
                    iValue += name.length;
                    return false;
                }
            });
            if (index !== -1) {
                return index + 1;
            } else {
                throw "Unknown name at position " + iValue;
            }
        },
    // Confirm that a literal character matches the string value
        checkLiteral = function() {
            if (value.charAt(iValue) !== format.charAt(iFormat)) {
                throw "Unexpected literal at position " + iValue;
            }
            iValue++;
        };

    for (iFormat = 0; iFormat < format.length; iFormat++) {
        if (literal) {
            if (format.charAt(iFormat) === "'" && !lookAhead("'")) {
                literal = false;
            } else {
                checkLiteral();
            }
        } else {
            switch (format.charAt(iFormat)) {
                case "d":
                    day = getNumber("d");
                    break;
                case "D":
                    getName("D", dayNamesShort, dayNames);
                    break;
                case "o":
                    doy = getNumber("o");
                    break;
                case "m":
                    month = getNumber("m");
                    break;
                case "M":
                    month = getName("M", monthNamesShort, monthNames);
                    break;
                case "y":
                    year = getNumber("y");
                    break;
                case "@":
                    date = new Date(getNumber("@"));
                    year = date.getFullYear();
                    month = date.getMonth() + 1;
                    day = date.getDate();
                    break;
                case "!":
                    date = new Date((getNumber("!") - ticksTo1970) / 10000);
                    year = date.getFullYear();
                    month = date.getMonth() + 1;
                    day = date.getDate();
                    break;
                case "'":
                    if (lookAhead("'")){
                        checkLiteral();
                    } else {
                        literal = true;
                    }
                    break;
                default:
                    checkLiteral();
            }
        }
    }

    if (iValue < value.length){
        extra = value.substr(iValue);
        if (!/^\s+/.test(extra)) {
            throw "Extra/unparsed characters found in date: " + extra;
        }
    }

    if (year === -1) {
        year = new Date().getFullYear();
    } else if (year < 100) {
        year += new Date().getFullYear() - new Date().getFullYear() % 100 +
        (year <= shortYearCutoff ? 0 : -100);
    }

    if (doy > -1) {
        month = 1;
        day = doy;
        do {
            dim = this._getDaysInMonth(year, month - 1);
            if (day <= dim) {
                break;
            }
            month++;
            day -= dim;
        } while (true);
    }

    date = daylightSavingAdjust(new Date(year, month - 1, day));
    if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) {
        throw "Invalid date"; // E.g. 31/02/00
    }
    return date;
}

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

    // todo use values from nvp table
    // categories = "Masters,Open,Adult,Junior,Youth-A,Youth-B,Youth-C,Youth-D"
    convertToCategory: function(value) {
        var map = {
                "master": "Masters",
                "masters": "Masters",
                "open": "Open",
                "adult": "Adult",
                "junior": "Junior",
                "jr": "Junior",
                "youtha": "Youth-A",
                "a": "Youth-A",
                "youthb": "Youth-B",
                "b": "Youth-B",
                "youthc": "Youth-C",
                "c": "Youth-C",
                "youthd": "Youth-D",
                "d": "Youth-D"
            };

        value = value.toLowerCase().trim().replace(/[ -]+/,"");
        value = map[value];
        if (value) {
            return value;
        }
        return ErrorValue;
    },

    // todo use values from nvp table
    convertToRegion: function(value) {
        var match, r, matchCount,
            regions = [
                "101washingtonalaska",
                "102northwest",
                "103northerncalifornia",
                "201southerncalifornia",
                "202southernmountain",
                "203colorado",
                "301midwest",
                "302ohiorivervalley",
                "303midatlantic",
                "401heartland",
                "402bayou",
                "403deepsouth",
                "501capital",
                "502newenglandwest",
                "503newenglandeast"
            ],
            map = {
                "101": "101 (Washington / Alaska)",
                "102": "102 (Northwest)",
                "103": "103 (Northern California)",
                "201": "201 (Southern California)",
                "202": "202 (Southern Mountain)",
                "203": "203 (Colorado)",
                "301": "301 (Midwest)",
                "302": "302 (Ohio River Valley)",
                "303": "303 (Mid-Atlantic)",
                "401": "401 (Heartland)",
                "402": "402 (Bayou)",
                "403": "403 (Deep South)",
                "501": "501 (Capital)",
                "502": "502 (New England West)",
                "503": "503 (New England East)"
            },
            num = parseInt(value, 10);

        if (!isNaN(num) && map[num]) {
            return map[num];
        } else {
            // try to match by string
            matchCount = 0;
            match = value.toLowerCase().replace(/[() \/]/, "");
            regions.forEach(function(r) {
                if (r.indexOf(match) >= 0) {
                    value = map[parseInt(r, 10)];
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
