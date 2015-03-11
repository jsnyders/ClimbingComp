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

var fs = require('fs');
var csv = require('csv');
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
 *     item: an object created from the input row
 * }
 *
 * @param csvFile file name of CSV file to read from
 * @param headerRow Boolean if true the first row of the CSV file is considered a header and skipped
 * @param minColumns number minimum number of columns each row must have
 * @param columns an array of property names. Each array index corresponds to a field/column in the input row
 *          for each field the value is copied to the item object name of the property to create
 * @param validateItem a function(item, addError(message)) that is called with each item after it is created from a CSV row
 *          The function should call addError with an error message for any problems it finds in the data.
 * @param next function(err, collection) It is possible for both err and collection to be not null. This
 *          allows processing the rows that don't have errors and reporing problems for the rows with errors.
 */
function loadFromCSV(csvFile, headerRow, minColumns, columns, sourceColumns, validateItem, next) {
    var collection = [],
        errors = [],
        total = 0;

    csv()
        .from.path("" + csvFile, { delimiter: ',', escape: '"' })
        .transform(function(row, index) {
            if (headerRow && index === 0) {
                return null;
            }
            return row;
        })
        .on('record', function(row, index) {
            var i, item, sourceItem, itemErrors,
                line = index + 1;

            total += 1;

            if (row.length < minColumns) {
                errors.push({line: line, sourceItem: {}, errors: ["Too few columns"]});
                return;
            }

            item = {};
            sourceItem = {};
            for (i = 0; i < columns.length; i++) {
                if (columns[i] !== null) {
                    item[columns[i]] = (i < row.length) ? row[i].trim() : "";
                }
                if (sourceColumns[i] !== null) {
                    sourceItem[sourceColumns[i]] = (i < row.length) ? row[i].trim() : "";
                }
            }
            itemErrors = [];
            validateItem(item, function addError(message) {
                itemErrors.push(message);
            });
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

        })
        .on('end', function(/*count*/) {
            if (errors.length === 0) {
                next(null, collection, total);
            } else {
                next(new CSVDataError("One or more errors in CSV input.", errors), collection, total);
            }
        })
        .on('error', function(error) {
            next(error);
        });
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
