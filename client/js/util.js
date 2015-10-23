/*
 * Copyright (c) 2014, John Snyders
 *
 * Utility functions
 */
/*global jQuery, logger*/

var util = {};

(function(util, $, logger, undefined) {
    "use strict";

    var BASE_SESSION_KEY = "ClimbingComp.";

    util.writeForm = function(mod, mapping) {
        var i, m, $field;
        for (i = 0; i < mapping.length; i++) {
            m = mapping[i];
            $field = $("#" + m.id);

            // xxx support various field types
            if ($field[0].nodeName === "INPUT" && $field[0].type === "checkbox") {
                $field[0].checked = !!mod[m.prop];
                if ($field.hasClass("ui-flipswitch-input")) {
                    $field.flipswitch("refresh");
                }
            } else {
                $field.val(mod[m.prop]);
                if ($field[0].nodeName === "SELECT") {
                    $field.selectmenu("refresh");
                }
            }
        }
    };

    util.readForm = function(mod, mapping) {
        var i, m, $field;
        for (i = 0; i < mapping.length; i++) {
            m = mapping[i];
            $field = $("#" + m.id);

            // xxx support various field types
            if ($field[0].nodeName === "INPUT" && $field[0].type === "checkbox") {
                mod[m.prop] = $field[0].checked;
            } else {
                mod[m.prop] = $("#" + m.id).val();
            }
        }
    };

    /*
     * Columns:
     *   prop: <string> name of property in data row
     *   label: <string> label to use column heading
     *   priority: <n>
     *   format: function(value, row, rowIndex, columnIndex)
     *   hide: <bool>
     *   cls:
     *   link:
     *   action:
     *   icon:
     *   args [<string>...] arguments for link or action prefix with ! for global parameters
     * Options:
     *   breakOn: function(row)
     *   nullValue: <string>
     *   params: {<key>:<value} global parameters
     *   page: function() called to get more data
     *   total: <n> total number of rows if present is displayed as a table footer
     */
    util.renderTable = function($table, columns, data, options) {
        var i, j, k, row, col, br, display, argValues, value,
            table = "",
            header = "",
            lastBreak = "";

        function getParam(row, arg) {
            var global = false;
            if ($.isFunction(arg)) {
                return arg(row);
            } // else
            if (arg.substr(0,1) === "!") {
                global = true;
                arg = arg.substr(1);
            }
            if (global) {
                return options.params[arg];
            } // else
            return row[arg];
        }

        function makeHref(col, row) {
            var i,arg,
                href = "#" + col.link;

            if ( col.args ) {
                if (href.indexOf("?") < 0) {
                    href += "?";
                }
                for (i = 0; i < col.args.length; i++) {
                    arg = col.args[i];
                    if (i > 0) {
                        href += ":";
                    }
                    href += getParam(row, arg);
                }
            }
            return href;
        }

        //         {label: "Actions", action: "delete", icon: "ui-icon-delete", args: ["username"]}
        // xxx not used
        function makeButton(col, row) {

        }

        options = options || {};

        header += "<tr class='ui-bar-d tableHeader'>";
        for (j = 0; j < columns.length; j++) {
            col = columns[j];
            if (col.hide) {
                continue;
            }
            if (col.priority) {
                header += "<th data-priority='" + col.priority + "'>";
            } else {
                header += "<th>";
            }
            header += col.label + "</th>";
        }
        header += "</tr>";
        $table.children("thead").html(header);

        for (i = 0; i < data.length; i++) {
            row = data[i];
            table += "<tr>";
            if (options.breakOn) {
                br = options.breakOn(row);
                if (br !== lastBreak) {
                    table += "<td class='colbreak' colspan='" + columns.length + "'>" + br + "</td></tr>" + header +  "<tr>";
                    lastBreak = br;
                }
            }
            for (j = 0; j < columns.length; j++) {
                col = columns[j];
                if (col.hide) {
                    continue;
                }
                if (col.cls) {
                    table += "<td class='" + col.cls + "'>";
                } else {
                    table += "<td>";
                }
                if (col.action) {
                    table += "<button type='button' data-action='" + col.action + "'";
                    if (col.args) {
                        argValues = [];
                        for (k = 0; k < col.args.length; k++) {
                            argValues.push(getParam(row, col.args[k]));
                        }
                        table += " data-args='" + util.escapeHTML(argValues.join("\n")) + "'";
                    }
                    table += " class='ui-btn ui-btn-icon-notext ui-corner-all " + col.icon + "'></button>";
                } else {
                    if ($.isFunction(col.format)) {
                        display = col.format(row[col.prop], row, i, j);
                    } else {
                        value = row[col.prop];
                        if ( value === null || value === undefined ) {
                            value = options.nullValue || "";
                        }
                        display = util.escapeHTML(value);
                    }
                    if (col.icon) {
                        display = "<span class='ui-icon " + col.icon +"'></span>" + display;
                    }
                    if (col.link) {
                        table += "<a href='" + makeHref(col, row) + "'>" + display + "</a></td>";
                    } else {
                        table += display + "</td>";
                    }
                }
            }
            table += "</tr>";
        }
        // xxx paging support
        $table.children("tbody").html(table);
        if (options.total) {
            $table.next(".tableSummary").remove();
            $table.after("<div class='tableSummary'>Total: " + util.escapeHTML(options.total) + "</div>");
        }

    };

    util.tableToCSV = function($table) {
        var csv = "";
        $table.children("tbody").children("tr").each(function(r) {
            if (r > 0) {
                csv += "\n";
            }
            $(this).children("td").each(function(c) {
                if (c > 0) {
                    csv += ",";
                }
                csv += util.escapeCSV($(this).text());
            });
        });
        return csv;
    };

    util.renderOptions = function($select, list, cfg) {
        var i, item, selected, valueProp, labelProp, selectedProp, value, label,
            options = "";

        cfg = cfg || {};

        if (cfg.nullValue !== undefined && cfg.nullLabel) {
            options += "<option value='" + util.escapeHTML(cfg.nullValue) +
                "'>" + util.escapeHTML(cfg.nullLabel) + "</option>";
        }
        if (cfg.valuesOnly) {
            labelProp = cfg.label;
            for (i = 0; i < list.length; i++) {
                item = list[i];
                if ($.isFunction(labelProp)) {
                    label = labelProp(item);
                } else {
                    label = item;
                }
                options += "<option value='" + util.escapeHTML(item) +
                    "'>" + util.escapeHTML(label) + "</option>";
            }

        } else {
            valueProp = cfg.value || "value";
            labelProp = cfg.label || "label";
            selectedProp = cfg.selected || "selected";

            for (i = 0; i < list.length; i++) {
                item = list[i];
                selected = item[selectedProp] ? "selected " : "";
                if ($.isFunction(labelProp)) {
                    label = labelProp(item);
                } else {
                    label = item[labelProp];
                }
                options += "<option " + selected + "value='" + util.escapeHTML(item[valueProp]) +
                    "'>" + util.escapeHTML(label) + "</option>";
            }
        }
        $select.html(options);
        if (cfg.selectedValue !== undefined) {
            $select.val(cfg.selectedValue).selectmenu("refresh");
        } else {
// xxx is there ever a need to have the select fire change when initially rendered?
//xxx            $select.change();
        }
    };

    util.setSessionProperty = function(prop, value) {
        var key = BASE_SESSION_KEY + prop;

        if (value === null || value === undefined) {
            window.sessionStorage.removeItem(key);
        } else {
            if (typeof value === "object") {
                value = JSON.stringify(value);
            } else if (typeof value !== "string") {
                value = "" + value;
            }
            window.sessionStorage.setItem(key, value);
        }
    };

    util.getSessionProperty = function(prop) {
        //xxx restore JSON
        return window.sessionStorage.getItem(BASE_SESSION_KEY + prop);
    };


    /*
     * See https://www.owasp.org/index.php/XSS_%28Cross_Site_Scripting%29_Prevention_Cheat_Sheet#XSS_Prevention_Rules
     */
    var htmlMap = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#x27;", //  &apos; not recommended because its not in the HTML spec (See: section 24.4.1) &apos; is in the XML and XHTML specs.
        "/": "&#x2F;"   //  forward slash is included as it helps end an HTML entity
    };
    var htmlRE = /&|<|>|'|"|\//g;

    util.escapeHTML = function(value) {
        value = "" + value; // force it to be a string
        return value.replace(htmlRE, function(ch) {
            return htmlMap[ch];
        });
    };

    util.escapeCSV = function(value) {
        var m = /^\s*([+-]?\d*)(.\d*)?\s*$/.exec(value);
        if (m && !isNaN(parseFloat(value)) ) {
            return value; // its a number
        }
        return "\"" + value.replace("\"", "\"\"") + "\"";
    };

    // xxx todo configure date display format
    util.formatDate = function(date) {
        return date.getFullYear() + "-" + (date.getMonth() + 1) + "-" + date.getDate();
    };

    // xxx todo configure date display format
    // xxx todo want local time but server needs to tell us the time zone?
    util.formatDateTime = function(date) {
        return date.getFullYear() + "-" + (date.getMonth() + 1) + "-" + date.getDate() + " " +
            date.getUTCHours() + ":" + date.getUTCMinutes() + ":" + date.getUTCHours();
    };

    var zeros = "0000000000000000000000";

    util.zeroPad = function(n, length) {
        var value = "" + n;
        if (value.length < length) {
            value = zeros.substring(0, length - value.length) + value;
        }
        return value;
    };

})(util, jQuery, logger);
