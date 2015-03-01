/*
 dbUtils.js

 Copyright (c) 2015, John Snyders

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

var util = require("util");
var conv = require("./conv");
var errors = require("./errors");
var db = require('mysql');

//xxx cleanup doc
// o=order
// s=search
// f=filter
// c=columns
// x=exclude columns?
// p=page offset,limit
//
// ?c=<c>...&o=<c>:a|d,...&f=<c>:<op>:v&o=<offset>&l=<limit>
// SELECT SQL_CALC_FOUND_ROWS * FROM tbl_name WHERE id > 100 LIMIT 10;
//
// SELECT FOUND_ROWS();

/*
 * operators: eq, ne, lt, gt, le, ge, n, nn, c
 */
var opMap = {
    "eq": "=",
    "ne": "!=",
    "lt": "<",
    "gt": ">",
    "le": "<=",
    "ge": ">=",
    "c": "LIKE"
};

function createWhereExpression(columnInfo, filtersParam, searchParam) {
    var i, m, prop, op, value, ci, filters, searchColumns,
        whereExpression = "";

    // xxx need to make sure the filtering and search comparisons happen in display space

    function conv(t, v) {
        var result;
        if (t === "number") {
            result = parseFloat(v);
            if (isNaN(result)) {
                return; // undefined means error
            }
        } else if (t === "bool") {
            result = conv.convertToBool(v);
            if (conv.isInvalid(result)) {
                return; // undefined means error
            }
        } else {
            result = v;
        } // xxx dates
        return result;
    }

    function esc(value, ch) {
        value = value.replace(new RegExp("%|_|" + ch, "g"), function(m) {
            return ch + m;
        });
        return value;
    }

    if (filtersParam) {
        filters = util.isArray(filtersParam) ? filtersParam : [filtersParam];

        for (i = 0; i < filters.length; i++) {
            m = /^([^:]+):(eq|ne|lt|gt|le|ge|c):(.*)/.exec(filters[i]);
            if (!m) {
                return new errors.InvalidInput("Bad filter parameter");
            } // else
            prop = m[1];
            op = m[2];
            value = m[3];
            // check if prop is valid
            if (!columnInfo.hasOwnProperty(prop)) {
                return new errors.InvalidInput("Bad filter parameter; no such property");
            } // else
            ci = columnInfo[prop];
            if (ci.noFilter) {
                return new errors.InvalidInput("Bad filter parameter; property not allowed");
            } // else
            if (i > 0) {
                whereExpression += " AND";
            }
            value = conv(columnInfo[prop].type, value);
            if (value === undefined) {
                return new errors.InvalidInput("Bad filter parameter; bad value");
            } // else
            if (op === "c") {
                value = "%" + esc(value, "!") + "%";
            }
            whereExpression += " " +ci.column + " " + opMap[op] + " " + db.escape(value);
            if (op === "c") {
                // xxx consider only including this if needed
                whereExpression += " ESCAPE '!'";
            }
        }
    }

    if (searchParam) {
        // xxx is this better or worse than a bunch of OR LIKEs?
        searchColumns = "";
        for (prop in columnInfo) {
            if (columnInfo.hasOwnProperty(prop)) {
                ci = columnInfo[prop];

                if (!ci.noFilter &&  !ci.noSearch) {
                    // xxx what if column value has char(10) in it?
                    searchColumns += "," + ci.column;
                }
            }
        }
        if (searchColumns) {
            if (whereExpression) {
                whereExpression += " AND";
            }
            whereExpression += " concat_ws('char(10)'" + searchColumns + ") LIKE '%" + esc(searchParam, "!") + "%' ESCAPE '!'";
        }
    }
    return whereExpression;
}

function createLimitAndOffset(pageParam) {
    var pageParamRe = /^([0-9]+):([0-9]+)$/,
        m = pageParamRe.exec(pageParam);

    if (!m) {
        return new errors.InvalidInput("Bad page parameter");
    } // else
    return " LIMIT " + m[2] +  " OFFSET " + m[1];
}

function getLimitAndOffset(pageParam) {
    var pageParamRe = /^([0-9]+):([0-9]+)$/,
        m = pageParamRe.exec(pageParam);

    if (!m) {
        return null;
    }
    return [parseInt(m[2], 10), parseInt(m[1], 10)];
}

function createOrderBy(columnInfo, orderParam) {
    var i, ci, prop, m, dir,
        orderBy = "",
        orders = util.isArray(orderParam) ? orderParam : [orderParam];

    // xxx need to make sure ordering happens on display values
    // order by can use the column alias
    for (i = 0; i < orders.length; i++) {
        m = /^([^:]+):(a|d)/.exec(orders[i]);
        if (!m) {
            return new errors.InvalidInput("Bad order parameter");
        } // else

        prop = m[1];
        dir = m[2];
        if (!columnInfo.hasOwnProperty(prop)) {
            return new errors.InvalidInput("Bad order parameter; no such property");
        } // else
        ci = columnInfo[prop];
        if (ci.noOrder) {
            return new errors.InvalidInput("Bad order parameter; property not allowed");
        } // else

        if (i > 0) {
            orderBy += ", ";
        }
        orderBy += (ci.alias ? ci.alias : ci.column) + (dir === "a" ? " ASC" : " DESC");
    }
    return " ORDER BY " + orderBy;
}

/**
 * Creates a query for a collection resource
 *   xxx use a real template???
 *
 * @param selectTemplate
 *   Example
 *   "SELECT {calcFoundRows} id, foo {, columns} FROM table1 as a, table2 as b WHERE a.id = b.id AND a.x = ? {AND filters} {order} {page}"
 * @param columnInfo Object map propertyName -> { column: <string>, type: "number"|"string"|"bool"|"date"
 * @param options object with optional properties:
 *          columnsParam
 *          excludeColumnsParam
 *          filtersParam
 *          searchParam
 *          orderParam
 *          pageParam
 */
function createCollectionQuery(selectTemplate, columnInfo, options ) {
    var i, query, columns, prop, ci, excludeProps,
        selectExp = "",
        whereExp = "",
        orderBy = "",
        limitAndOffset = "";

    function addSelectExp(ci) {
        if (selectExp.length > 0) {
            selectExp += ", ";
        }
        selectExp += ci.column;
        if (ci.alias) {
            selectExp += " AS " + ci.alias;
        }
    }

    if (options.columnsParam) {
        columns = options.columnsParam.split(",");

        // add any required columns
        for (prop in columnInfo) {
            if (columnInfo.hasOwnProperty(prop)) {
                ci = columnInfo[prop];

                if (ci.required) {
                    addSelectExp(ci);
                }
            }
        }

        for (i = 0; i < columns.length; i++) {
            prop = columns[i];
            if (!columnInfo.hasOwnProperty(prop)) {
                return new errors.InvalidInput("Bad column parameter; no such property");
            } // else
            ci = columnInfo[prop];
            if (ci.required) {
                continue; // it has already been added
            }
            addSelectExp(ci);
        }
    } else {
        excludeProps = {};
        if (options.excludeColumnsParam) {
            columns = options.excludeColumnsParam.split(",");

            // check that columns are valid
            for (i = 0; i < columns.length; i++) {
                prop = columns[i];
                if (!columnInfo.hasOwnProperty(prop)) {
                    return new errors.InvalidInput("Bad column parameter; no such property");
                } // else
                excludeProps[prop] = true;
            }
        }

        for (prop in columnInfo) {
            if (columnInfo.hasOwnProperty(prop)) {
                ci = columnInfo[prop];

                if (ci.required || !excludeProps[prop]) {
                    addSelectExp(ci);
                }
            }
        }
    }

    if (options.filtersParam || options.searchParam) {
        whereExp = createWhereExpression(columnInfo, options.filtersParam, options.searchParam);
        if (util.isError(whereExp)) {
            return whereExp;
        }
    }
    if (options.orderParam) {
        orderBy = createOrderBy(columnInfo, options.orderParam);
        if (util.isError(orderBy)) {
            return orderBy;
        }
    }
    if (options.pageParam) {
        limitAndOffset = createLimitAndOffset(options.pageParam);
        if (util.isError(limitAndOffset)) {
            return limitAndOffset;
        }
    }

    query = selectTemplate.replace(/{{([ |_,a-zA-Z0-9]+)}}/g, function(m, key) {
        var prefix, token,
            result = "",
            parts = key.split("|");

        if (parts.length === 1) {
            prefix = "";
            token = parts[0];
        } else if (parts.length === 2) {
            prefix = parts[0];
            token = parts[1];
        } else {
            throw new Error("Invalid template token");
        }

        if (token === "columns") {
            if (selectExp) {
                result = prefix + selectExp;
            }
        } else if (token === "filters") {
            if (whereExp) {
                result = prefix + whereExp;
            }
        } else if (token === "order") {
            if (orderBy) {
                result = prefix + orderBy;
            }
        } else if (token === "page") {
            if (limitAndOffset) {
                result = prefix + limitAndOffset;
            }
        } else if (token === "calcFoundRows") {
            if (limitAndOffset) {
                result = prefix + "SQL_CALC_FOUND_ROWS";
            }
        } else {
            throw new Error("Invalid template token");
        }
        return result;
    });

    return query;
}

module.exports = {
    createCollectionQuery: createCollectionQuery,
    createWhereExpression: createWhereExpression,
    createLimitAndOffset: createLimitAndOffset,
    getLimitAndOffset: getLimitAndOffset,
    createOrderBy: createOrderBy
};
