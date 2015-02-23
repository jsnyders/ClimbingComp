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
 * will need to support filtering possibly paging
 * break on gender+category
 */

(function(app, model, $, logger, util, undefined) {
    "use strict";

    /*
     climberId: row.id,
     version: row.version,
     usacMemberId: row.usac_member_id + "", // force it to be a string
     firstName: row.first_name || "",
     lastName: row.last_name,
     location: row.location || "",
     gender: row.gender,
     category: row.category,
     birthYear: row.birth_year,
     birthDate: row.birth_date,
     region: row.region || "",
     team: row.team || "",
     coach: row.coach || "",
     updatedBy: row.updated_by,
     updatedOn: row.updated_on

     */
    var module = "AdminClimbers", // for logging
        climbersColumns = [
            {prop: "usacMemberId", label: "USAC Member ID", link: "adminClimber", args: ["climberId"], icon: "ui-icon-edit"},
            {prop: "firstName", label: "First Name"},
            {prop: "lastName", label: "Last Name"},
            {prop: "birthYear", label: "Birth Year", priority: 1},
//xxx            {prop: "birthDate", label: "Birth Date"}, //xxx one birth field only?
            {prop: "gender", label: "Gender", priority: 1},
            {prop: "category", label: "Category", priority: 1},
            {prop: "region", label: "Region", priority: 2},
            {prop: "team", label: "Team", priority: 2},
            {prop: "coach", label: "Coach", priority: 2},
            {label: "Actions", action: "delete", icon: "ui-icon-delete", args: ["climberId", "version"]}
            // xxx updatedBy, updatedOn
        ];

    var allFields = [
            {label:"Menber No.", value: "usac_member_id" },
            {label:"First Name", value: "first_name"},
            {label:"Last Name", value: "last_name"},
            {label:"Gender", value: "gender"},
            {label:"Category", value: "category"},
            {label:"Birthday", value: "birth_date"},
            {label:"Birth Year", value: "birth_year"},
            {label:"Region", value: "region"},
            {label:"Team", value: "team"},
            {label:"Coach", value: "coach"},
            {label:"Location", value: "location"}
        ],
        defaultFields = [ "usac_member_id", "first_name", "last_name", "gender", "category", "region", "team"];

    function lookupFieldLabel(field) {
        var i;
        for (i = 0; i < allFields.length; i++) {
            if (allFields[i].value === field) {
                return allFields[i].label;
            }
        }
        return "unknown";
    }

    app.addPage({
        name: "adminClimbers",
        init: function(ui) {
            $("#cClimbersTable").on("click", "button", function(event) {
                var args,
                    btn$ = $(this);

                if (btn$.attr("data-action") === "delete") {
                    if (confirm("Ok to delete?")) { // xxx don't use confirm
                        args = btn$.attr("data-args").split("\n");
                        console.log("xxx todo delete" + args.join(":"));
                        model.deleteClimber(args[0], args[1])
                            .done(function() {
                                $.mobile.changePage("#adminClimbers");
                            })
                            .fail(function(status, message) {
                                app.showErrorMessage(status, "Failed to delete climber", message);
                            });
                    }
                }
            });
        },
        prepare: function() {
            app.clearMessage(this.name);
        },
        open: function(ui) {
            $.mobile.loading("show");
            model.fetchClimbers()
                .done(function(climbers) {
                    util.renderTable($("#cClimbersTable"), climbersColumns, climbers);
                    $("#cClimbersTable").table("rebuild");
                })
                .fail(function(status, message) {
                    app.showErrorMessage(status, "Failed to get climbers", message);
                })
                .always(function() {
                    $.mobile.loading("hide");
                });
        }
    });

    app.addPage({
        name: "adminImportClimbers",
        init: function(ui) {
            var i, fieldOptions, html;

            $("#aicUpload").click(function() {
                // xxx set something so that results page know it came from this action
                if ($("#aicFile").val() === "") {
                    // xxx better messaging for validation errors
                    alert("Choose a file first.");
                    return;
                }
                $.mobile.changePage("#adminImportClimbersResults");
            });

            // setup field chooser
            // xxx TODO use drag and drop
            fieldOptions = "<option value=''>ignore</option>\n";
            allFields.forEach(function(field) {
                fieldOptions += "<option value='" + field.value + "'>" + field.label + "</option>\n";
            });
            html = "";
            for (i = 0; i < allFields.length; i++) {
                html += "<select id='aicField" + (i + 1) + "' data-inline='true'>";
                html += fieldOptions;
                html += "</select>";
            }
            $("#aicFields").html(html);
            // set defaults
            for (i = 0; i < defaultFields.length; i++) {
                $("#aicField" + (i + 1)).val(defaultFields[i]);
            }

        },
        prepare: function() {
            app.clearMessage(this.name);
            $("#aicFile").val("");
            // leave the other fields as they are
        },
        open: function(ui) {
            // xxx anything to do?
        }
    });

    app.addPage({
        name: "adminImportClimbersResults",
        init: function(ui) {

            $("#aicrUpdate").click(function() {
                alert("not yet implemented");
            });

        },
        prepare: function() {
            app.clearMessage(this.name);
            // clear out stats
            $("#aicrAdded,#aicrUpdated,#aicrNoChange,#aicrNotUpdated,#aicrErrors").each(function() {
                $(this).val("");
            });
            // clear errors table
            $("#aicrErrorsTable").children().empty();

            // xxx hide update button if needed
            $("#aicrUpdate").hide();
        },
        open: function(ui) {
            var i, len,
                file = $("#aicFile")[0].files[0],
                hasHeader = $("#aicHasHeader")[0].checked,
                action = $("#aicAction").val(),
                fields = [];

            if (!file) {
                // somehow got here without going through adminImportClimbers > Upload
                $.mobile.changePage("#adminClimbers");
                return;
            }
            $("#aicFile").val(""); // guard against doing the import twice by mistake

            len = 0;
            for (i = 0; i < allFields.length; i++) {
                fields.push($("#aicField" + (i + 1)).val());
                if (fields[fields.length - 1] !== "") {
                    len = fields.length;
                }
            }
            fields.length = len; // truncate trailing "ignore" fields

            $.mobile.loading("show");
            model.uploadClimbers(hasHeader, action, fields, file)
                .done(function(data) {
                    var i, errors, error, item, columns,
                        stats = data.stats;

                    $("#aicrAdded").val(stats.added);
                    $("#aicrUpdated").val(stats.updated);
                    $("#aicrNoChange").val(stats.noChange);
                    $("#aicrNotUpdated").val(stats.notUpdated);
                    $("#aicrErrors").val(stats.errors);

                    // xxx much more complicated review and resubmit
                    if (data.errors && data.errors.length > 0) {
                        columns = [];
                        columns.push({prop: "line", label: "Line"});
                        columns.push({prop: "error", label: "Error"});
                        for (i = 0; i < fields.length; i++) {
                            columns.push({prop: fields[i], label: lookupFieldLabel(fields[i])});
                        }
                        errors = [];
                        for (i = 0; i < data.errors.length; i++) {
                            error = data.errors[i];
                            item = $.extend({}, error.item); // make a copy
                            item.line = error.line;
                            item.error = error.error;
                            errors.push(item);
                        }
                        util.renderTable($("#aicrErrorsTable"), columns, errors);

                    }

                })
                .fail(function(status, message) {
                    app.showErrorMessage(status, "Failed to upload climbers", message);
                })
                .always(function() {
                    $.mobile.loading("hide");
                });
        }
    });

})(app, appModel, jQuery, logger, util);
