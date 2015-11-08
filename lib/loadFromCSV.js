/*
 loadFromCSV.js
 Utility function to load a CSV format file into an array of objects.

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
/*jshint node: true, strict: false */

var fs = require("fs");
var csvParse = require("csv").parse;
var util = require("util");

function CSVDataError(message, errors) {
    Error.call(this, {
        message: message
    });
    this.name = "CSVDataError";
    this.errors = errors;
}
util.inherits(CSVDataError, Error);

/**
 * Reads a CSV file and returns, via the next collection argument, an array of objects as follows:
 * {
 *     line: line number of the input row the item was created from
 *     item: an object created from the input row using property names from columns
 *     sourceItem: an object created from the input row using property names from soruceColumns
 * }
 *
 * @param {string} csvFile file name of CSV file to read from
 * @param {boolean} headerRow if true the first row of the CSV file is considered a header and skipped
 * @param {number} minColumns number minimum number of columns each row must have
 * @param {string[]} columns an array of property names. Each array index corresponds to a field/column in the input row
 *          for each field the value is copied to the item object name of the property to create
 * @param {string[]} [sourceColumns] optional similar to columns but used to populate sourceItem
 * @param validateItem a function(item, addError(message)) that is called with each item after it is created from a CSV row
 *          The function should call addError with an error message for any problems it finds in the data.
 * @param next function(err, collection, total) It is possible for both err and collection to be not null. This
 *          allows processing the rows that don't have errors and reporing problems for the rows with errors.
 *          total is the number of rows in the input file not counting the header row.
 */
function loadFromCSV(csvFile, headerRow, minColumns, columns, sourceColumns, validateItem, next) {
    var parser, input,
        collection = [],
        errors = [],
        index = 0,
        total = 0;

    input = fs.createReadStream(csvFile);
    parser = csvParse({ 
        delimiter: ',',
        quote: '"',
        escape: '"',
        skip_empty_lines: true
    });
    parser.on("readable", function() {
        var row, i, item, sourceItem, itemErrors, line;

        function addMessage(message) {
            itemErrors.push(message);
        }

        sourceItem = null;
        for (;;) {
            row = parser.read();
            if (!row) {
                break;
            }
            index += 1;
            line = index;

            if (headerRow && index === 1) {
                continue;
            }
            total += 1;

            if (row.length < minColumns) {
                errors.push({line: line, sourceItem: {}, errors: ["Too few columns"]});
                continue;
            }

            item = {};
            if (sourceColumns) {
                sourceItem = {};
            }
            for (i = 0; i < columns.length; i++) {
                if (columns[i] !== null) {
                    item[columns[i]] = (i < row.length) ? row[i].trim() : "";
                }
                if (sourceColumns && sourceColumns[i] !== null) {
                    sourceItem[sourceColumns[i]] = (i < row.length) ? row[i].trim() : "";
                }
            }
            itemErrors = [];
            validateItem(item, addMessage);
            if (itemErrors.length > 0) {
                errors.push({
                    line: line,
                    sourceItem: sourceItem,
                    errors: itemErrors
                });
            } else {
                collection.push({
                    line: line,
                    item: item,
                    sourceItem: sourceItem
                });
            }

        }
    });

    parser.on('error', function(error){
        next(error);
    });

    parser.on('finish', function(){
        if (errors.length === 0) {
            next(null, collection, total);
        } else {
            next(new CSVDataError("One or more errors in CSV input.", errors), collection, total);
        }
    });

    input.pipe(parser);
}

function checkDuplicates(rows, prop, errors) {
    var i, a, b,
        lastMatch = null,
        dupsFound = false;

    rows.sort(function(a, b) {
        if (a.item[prop] > b.item[prop]) {
            return 1;
        }
        if (a.item[prop] < b.item[prop]) {
            return -1;
        }
        return 0;
    });
    i = 0;
    while (i < rows.length - 1) {
        a = rows[i];
        b = rows[i + 1];
        if (a.item[prop] === b.item[prop]) {
            dupsFound = true;
            // move first duplicate to errors
            a.error = "Duplicate on line " + b.line;
            delete a.item;
            errors.push(a);
            rows.splice(i, 1);
            // and remember that the second is also a duplicate
            lastMatch = a.line;
        } else {
            if (lastMatch) {
                a.error = "Duplicate on line " + lastMatch;
                delete a.item;
                errors.push(a);
                rows.splice(i, 1);
                lastMatch = null;
            } else {
                i += 1;
            }
        }
    }
    if (lastMatch) {
        b.error = "Duplicate on line " + lastMatch;
        delete b.item;
        errors.push(b);
    }
    return dupsFound;
}

module.exports = {
    loadFromCSV: loadFromCSV,
    checkDuplicates: checkDuplicates,
    CSVDataError: CSVDataError
};
