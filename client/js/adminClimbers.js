/*global jQuery, logger, app, appModel,util*/
/*
 Admin Climbers page

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
/*
 * xxx todo
 * date format
 * sorting
 * will need to support general filtering/sorting and possibly paging
 * break on gender+category
 */

(function(app, model, $, logger, util, undefined) {
    "use strict";

    var module = "AdminClimbers", // for logging
        eventId = "",
        climbersForLabel = "";

    var climbersColumns = [
            // for event climbers
            {prop: "bibNumber", label: "Bib #", link: "adminClimber", args: ["!eventId", "climberId"], icon: "ui-icon-edit"},
            {prop: "usacMemberId", label: "USAC Member ID" },
            // for master list of climbers
            {prop: "usacMemberId", label: "USAC Member ID", link: "adminClimber", args: ["!eventId", "climberId"], icon: "ui-icon-edit"},
            // for all
            {prop: "firstName", label: "First Name"},
            {prop: "lastName", label: "Last Name"},
            {prop: "birthDate", label: "Birth Date", priority: 1, format: function(value, r, c) {
                if (!value) {
                    return "-";
                }
                return util.formatDate(value);
            }},
            {prop: "gender", label: "Gender", priority: 1},
            {prop: "category", label: "Category", priority: 1},
            {prop: "region", label: "Region", priority: 2},
            {prop: "team", label: "Team", priority: 2},
            {prop: "coach", label: "Coach", priority: 2},
            {prop: "updatedBy", label: "Updated By", priority: 2},
            {prop: "updatedOn", label: "Updated On", priority: 2, format: function(value, r, c) {
                return util.formatDateTime(value);
            }},
            {label: "Actions", action: "delete", icon: "ui-icon-delete", args: ["climberId", "version", function(row) {
                return row.firstName + " " + row.lastName;
            }]}
        ];


    // xxx get this from model layer, persist defaults
    var allMasterFields = [
            {label:"Menber No.", value: "usacMemberId" },
            {label:"First Name", value: "firstName"},
            {label:"Last Name", value: "lastName"},
            {label:"Gender", value: "gender"},
            {label:"Category", value: "category"},
            {label:"Birth Date", value: "birthDate"},
            {label:"Region", value: "region"},
            {label:"Team", value: "team"},
            {label:"Coach", value: "coach"}
        ],
        defaultMasterFields = [ "usacMemberId", "firstName", "lastName", "gender", "category", "region", "team"];

    // xxx get this from model layer, persist defaults
    var allEventFields = [
            {label:"Bib No.", value: "bibNumber" },
            {label:"Menber No.", value: "usacMemberId" },
            {label:"First Name", value: "firstName"},
            {label:"Last Name", value: "lastName"},
            {label:"Gender", value: "gender"},
            {label:"Category", value: "category"},
            {label:"Birth Date", value: "birthDate"},
            {label:"Region", value: "region"},
            {label:"Team", value: "team"},
            {label:"Coach", value: "coach"}
        ],
        defaultEventFields = [ "bibNumber", "usacMemberId", "firstName", "lastName", "gender", "category", "region", "team"];

    function lookupFieldLabel(collection, field) {
        var i;
        for (i = 0; i < collection.length; i++) {
            if (collection[i].value === field) {
                return collection[i].label;
            }
        }
        return "unknown";
    }

    function findColumn(prop) {
        var i;
        for (i = 0; i < climbersColumns.length; i++) {
            if (climbersColumns[i].prop === prop) {
                return climbersColumns[i];
            }
        }
        return null;
    }

    function getClimbersForLabel() {
        $("#cClimberEvents").children().each(function() {
            if (this.selected) {
                climbersForLabel = $(this).text();
                return false;
            }
        });
    }

    function fetchEvents() {

        function renderClimberEventOptions() {

            function eventLabel(event) {
                return "Event at " + util.escapeHTML(event.location) + " on " + util.formatDate(event.date);
            }

            util.renderOptions($("#cClimberEvents"), model.events, {
                value:"eventId",
                label: eventLabel,
                nullValue: "m",
                nullLabel: "Master Climber List",
                selectedValue: eventId
            });
        }

        renderClimberEventOptions();
        if (model.events.length === 0) {
            model.fetchEvents().done(function() {
                renderClimberEventOptions();
            });
        }
    }

    function fetchClimbers() {
        var options, orderBy,
            columnBreak = null,
            catFilter = "",
            regionFilter = "",
            filters = "";

        app.clearMessage();
        clearClimbers();

        $.mobile.loading("show");
        catFilter = $("#cCategoryFilter").val();
        regionFilter = $("#cRegionFilter").val();
        if (catFilter && regionFilter) {
            filters = catFilter + "," + regionFilter;
        } else {
            filters = catFilter || regionFilter;
        }
        if (filters) {
            filters = filters.split(","); // xxx what if there is a , in the data
        }

        // xxx todo let the user choose
        orderBy = "region:a,category:a,gender:d,lastName:a";
        orderBy = orderBy.split(",");

        findColumn("region").hide = false;
        if (regionFilter === "") {
            columnBreak = function(row) {
                return row.region;
            };
            findColumn("region").hide = true;
        }
        options = {
            breakOn: columnBreak,
            nullValue: "-",
            params: {eventId: eventId}
        };
        if (eventId === "m") {
            model.fetchClimbers(filters, orderBy)
                .done(function (climbers, offset, total) {
                    climbersColumns[0].hide = true;
                    climbersColumns[1].hide = true;
                    climbersColumns[2].hide = false;
                    options.total = total;
                    util.renderTable($("#cClimbersTable"), climbersColumns, climbers, options);
                    $("#cClimbersTable").table("rebuild");
                })
                .fail(function (status, message) {
                    app.showErrorMessage(status, "Failed to get master list of climbers", message);
                })
                .always(function () {
                    $.mobile.loading("hide");
                });
        } else {
            model.fetchEventClimbers(eventId, filters, orderBy)
                .done(function (climbers, offset, total) {
                    climbersColumns[0].hide = false;
                    climbersColumns[1].hide = false;
                    climbersColumns[2].hide = true;
                    options.total = total;
                    util.renderTable($("#cClimbersTable"), climbersColumns, climbers, options);
                    $("#cClimbersTable").table("rebuild");
                })
                .fail(function (status, message) {
                    app.showErrorMessage(status, "Failed to get climbers for event", message);
                })
                .always(function () {
                    $.mobile.loading("hide");
                });
        }
    }

    function clearClimbers() {
        util.renderTable($("#cClimbersTable"), climbersColumns, []);
        $("#cClimbersTable").table("rebuild");
    }

    app.addPage({
        name: "adminClimbers",
        init: function(ui) {
            logger.debug(module, "Init page");

            model.fetchGenderCategoriesFilters()
                .done(function(list) {
                    util.renderOptions($("#cCategoryFilter"), list, {
                        nullValue: "",
                        nullLabel: "All"
                    });
                });

            model.fetchRegionFilters()
                .done(function(list) {
                    util.renderOptions($("#cRegionFilter"), list, {
                        nullValue: "",
                        nullLabel: "All"
                    });
                });

            $("#cClimberEvents").change(function() {
                var v =  $(this).val();
                $.mobile.changePage("#adminClimbers?" + v, {allowSamePageTransition: true});
            });

            $("#cCreate").click(function() {
                $.mobile.changePage("#adminClimber?" + eventId + ":new");
            });

            $("#cImport").click(function() {
                $.mobile.changePage("#adminImportClimbers?" + eventId);
            });

            $("#cClimbersTable").on("click", "button", function(event) {
                var args,
                    btn$ = $(this);

                if (btn$.attr("data-action") === "delete") {
                    args = btn$.attr("data-args").split("\n");
                    if (eventId === "m") {
                        if (confirm("Ok to delete climber '" + args[2] + "'?")) { // xxx don't use confirm
                            model.deleteClimber(args[0], args[1])
                                .done(function() {
                                    $.mobile.changePage("#adminClimbers?" + eventId);
                                })
                                .fail(function(status, message) {
                                    app.showErrorMessage(status, "Failed to delete climber", message);
                                });
                        }

                    } else {
                        if (confirm("Ok to remove climber '" + args[2] + "' from this event?")) { // xxx don't use confirm
                            model.deleteEventClimber(eventId, args[0], args[1])
                                .done(function() {
                                    $.mobile.changePage("#adminClimbers?" + eventId);
                                })
                                .fail(function(status, message) {
                                    app.showErrorMessage(status, "Failed to delete climber", message);
                                });
                        }

                    }
                }
            });
            $("#cCategoryFilter").change(function() {
                fetchClimbers();
            });
            $("#cRegionFilter").change(function() {
                fetchClimbers();
            });
        },
        prepare: function(ui) {
            app.clearMessage(this.name);
            app.updateFooter();
            eventId = "m";
            if (ui.args && ui.args.length > 0) {
                eventId = ui.args[0];
            }
            clearClimbers();
        },
        open: function(ui) {
            logger.debug(module, "Page open");
            fetchEvents();
            getClimbersForLabel();
            fetchClimbers();
        }
    });

    app.addPage({
        name: "adminImportClimbers",
        init: function(ui) {

            $("#aicCancel").click(function() {
                $.mobile.changePage("#adminClimbers?" + eventId);
            });

            $("#aicUpload").click(function() {
                // xxx set something so that results page know it came from this action
                if ($("#aicFile").val() === "") {
                    // xxx better messaging for validation errors
                    alert("Choose a file first.");
                    return;
                }
                $.mobile.changePage("#adminImportClimbersResults?" + eventId);
            });

            // xxx TODO use drag and drop

        },
        prepare: function(ui) {
            var i, fieldOptions, html, fields, defaults;

            eventId = "m";
            if (ui.args && ui.args.length > 0) {
                eventId = ui.args[0];
            }
            app.clearMessage(this.name);
            $("#aicFile").val("");
            // leave the other fields as they are

            // set header title
            getClimbersForLabel();
            $("#aicFor").text(climbersForLabel);

            // setup field chooser based on if it is for an event or master list of climbers
            if (eventId === "m") {
                fields = allMasterFields;
                defaults = defaultMasterFields;
            } else {
                fields = allEventFields;
                defaults = defaultEventFields;
            }
            fieldOptions = "<option value=''>ignore</option>\n";
            fields.forEach(function(field) {
                fieldOptions += "<option value='" + field.value + "'>" + field.label + "</option>\n";
            });
            html = "";
            // allow for 2 extra columns in case some need to be skipped
            for (i = 0; i < fields.length + 2; i++) {
                html += "<select id='aicField" + (i + 1) + "' data-inline='true'>";
                html += fieldOptions;
                html += "</select>";
            }
            $("#aicFields").html(html);
            // set defaults
            for (i = 0; i < defaults.length; i++) {
                $("#aicField" + (i + 1)).val(defaults[i]);
            }
        },
        open: function(ui) {
            // xxx anything to do?
        }
    });

    app.addPage({
        name: "adminImportClimbersResults",
        init: function(ui) {

            $("#aicrDone").click(function() {
                $.mobile.changePage("#adminClimbers?" + eventId);
            });

            $("#aicrUpdate").click(function() {
                alert("not yet implemented");
            });

            $("#aicrErrorsCSV").on("popupafteropen", function() {
                var csv = util.tableToCSV($("#aicrErrorsTable"));

                $("#aicrErrorsCSV").find("textarea").height($(window).height() - 160).text(csv).focus()[0].select();
            });

        },
        prepare: function(ui) {
            eventId = "m";
            if (ui.args && ui.args.length > 0) {
                eventId = ui.args[0];
            }
            app.clearMessage(this.name);
            // clear out stats
            $("#aicrTotal,#aicrAdded,#aicrUpdated,#aicrNoChange,#aicrNotUpdated,#aicrWarnings,#aicrErrors").each(function() {
                $(this).val("");
            });
            // clear errors table
            $("#aicrErrorsTable").children().empty();
            // hide it all
            $("#aicrContent").hide();

            // set header title
            getClimbersForLabel();
            $("#aicrFor").text(climbersForLabel);

            // xxx hide update button if needed
            $("#aicrUpdate").hide();
            $("#aicrCSV").hide();
        },
        open: function(ui) {
            var len, result,
                file = $("#aicFile")[0].files[0],
                hasHeader = $("#aicHasHeader")[0].checked,
                action = $("#aicAction").val(),
                dateFormat = $("#aicDateFormat").val(),
                continueOnErrors = $("#aicContinueOnErrors").val() === "yes",
                fields = [];

            eventId = null;
            if (ui.args && ui.args.length > 0) {
                eventId = ui.args[0];
            }

            if (!file || !eventId) {
                // somehow got here without going through adminImportClimbers > Upload
                // or without an eventId
                $.mobile.changePage("#adminClimbers?m");
                return;
            }
            $("#aicFile").val(""); // guard against doing the import twice by mistake

            len = 0;
            $("#aicFields").children("select").each(function() {
                fields.push($(this).val());
                if (fields[fields.length - 1] !== "") {
                    len = fields.length;
                }
            });
            fields.length = len; // truncate trailing "ignore" fields

            if (eventId === "m") {
                result = model.uploadClimbers(hasHeader, action, continueOnErrors, dateFormat, fields, file);
            } else {
                result = model.uploadEventClimbers(eventId, hasHeader, action, continueOnErrors, dateFormat, fields, file);
            }

            $.mobile.loading("show", {
                text: "Importing. Please wait...",
                textVisible: true
            });
            result.done(function(data) {
                    var i, errors, error, item, columns, errorMessage, whichFields,
                        stats = data.stats;

                    $("#aicrContent").show();

                    $("#aicrTotal").val(stats.totalLines);
                    $("#aicrAdded").val(stats.added);
                    $("#aicrUpdated").val(stats.updated);
                    $("#aicrNoChange").val(stats.noChange);
                    $("#aicrNotUpdated").val(stats.notUpdated);
                    $("#aicrWarnings").val(stats.warnings || 0);
                    $("#aicrErrors").val(stats.errors);

                    // xxx much more complicated review and resubmit
                    if (data.errors && data.errors.length > 0) {
                        $("#aicrCSV").show();
                        if (eventId === "m") {
                            whichFields = allMasterFields;
                        } else {
                            whichFields = allEventFields;
                        }
                        columns = [];
                        columns.push({prop: "line", label: "Line"});
                        columns.push({prop: "error", label: "Error"});
                        for (i = 0; i < fields.length; i++) {
                            columns.push({prop: fields[i], label: lookupFieldLabel(whichFields, fields[i])});
                        }
                        errors = [];
                        for (i = 0; i < data.errors.length; i++) {
                            error = data.errors[i];
                            errorMessage = error.error;
                            if ($.isArray(error.errors)) {
                                errorMessage = error.errors.join(", ");
                            }
                            item = $.extend({}, error.sourceItem); // make a copy
                            item.line = error.line;
                            item.error = errorMessage;
                            errors.push(item);
                        }
                        util.renderTable($("#aicrErrorsTable"), columns, errors, {
                            nullValue: "-"
                        });
                    }

                })
                .fail(function(status, message) {
                    var what;
                    $("#aicrContent").show();
                    if (eventId === "m") {
                        what = "Failed to upload climbers";
                    } else {
                        what = "Failed to upload event climbers";
                    }
                    app.showErrorMessage(status, what, message);
                })
                .always(function() {
                    $.mobile.loading("hide");
                });
        }
    });

})(app, appModel, jQuery, logger, util);
