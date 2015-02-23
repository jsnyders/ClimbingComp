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
        message: message,
        errors: errors
    });
    this.name = "CSVDataError";
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
function loadFromCSV(csvFile, headerRow, minColumns, columns, validateItem, next) {
    var collection = [],
        errors = [];

    csv()
        .from.path("" + csvFile, { delimiter: ',', escape: '"' })
        .transform(function(row, index) {
            if (headerRow && index === 0) {
                return null;
            }
            return row;
        })
        .on('record', function(row, index) {
            var i, item, itemErrors;

            if (row.length < minColumns) {
                errors.push({line: index, errors: ["Too few columns"]});
                return;
            }

            item = {};
            for (i = 0; i < columns.length; i++) {
                if (columns[i] !== null) {
                    item[columns[i]] = (i < row.length) ? row[i].trim() : "";
                }
            }
            itemErrors = [];
            validateItem(item, function addError(message) {
                itemErrors.push(message);
            });
            if (itemErrors.length > 0) {
                errors.push({line: index, item: item, errors: itemErrors});
            } else {
                collection.push({
                    line: index,
                    item: item
                });
            }

        })
        .on('end', function(/*count*/) {
            if (errors.length === 0) {
                next(null, collection);
            } else {
                next(new CSVDataError("One or more errors in CSV input.", errors), collection);
            }
        })
        .on('error', function(error) {
            next(error);
        });
}

module.exports = {
    loadFromCSV: loadFromCSV,
    CSVDataError: CSVDataError
};
