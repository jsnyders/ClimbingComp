/*global jQuery, logger, app, appModel,util*/
/*
 Admin Event page

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
/*
 * xxx todo
 * date format
 * bug: when first opened doesn't always show active tab
 * event climbers: list, add, edit, delete, upload, export?
 * route export
 * print score card
 */

(function(app, model, $, logger, util, undefined) {
    "use strict";

    var module = "AdminEvent",
        event = null,
        routes = null,
        eventId = null,
        formMap = [
            {id: "aeLocation", prop: "location"},
            {id: "aeRegion", prop: "region"},
            {id: "aeDate", prop: "date"},
            {id: "aeSeries", prop: "series"},
            {id: "aeType", prop: "type"},
            {id: "aeSanctioning", prop: "sanctioning"},
            {id: "aeFallsPerClimb", prop: "recordFallsPerClimb"},
            {id: "aeNotes", prop: "notes"},
            {id: "aeColumns", prop: "scoreCardColumns"},
            {id: "aeRoutesHaveLocation", prop: "routesHaveLocation"},
            {id: "aeRoutesHaveColor", prop: "routesHaveColor"}
        ],
        scoreCardCol = [
            {prop: "number", label: "Number"},
            {prop: "location", label: "Location", format: renderInput},
            {prop: "color", label: "Color", format: renderInput},
            {prop: "points", label: "Points", format: renderInputNumber}
        ];

    function renderInput(value, r, c) {
        return "<input id='" + r + ":" + c + "' type='text' size='6' value='" + value + "'>";
    }

    function renderInputNumber(value, r, c) {
        return "<input id='" + r + ":" + c + "' type='text' size='4' value='" + value + "'>";
    }

    function loadEvent(returnOnError) {
        model.fetchEvent(eventId)
            .done(function(data) {
                event = data;
                util.writeForm(event, formMap);
            })
            .fail(function(status, message) {
                if (returnOnError) {
                    $.mobile.changePage("#adminEvents");
                    app.showErrorMessage(status, "Failed to get event", message);
                } else {
                    app.showErrorMessage(status, "Failed to get event", message);
                }
            });
    }

    function renderRoutes() {
        var i, route, $table,
            ltr = ["a", "b", "c", "d"],
            html = "",
            colSpec =[],
            columnsRoutes = [];

        for (i = 0; i < event.scoreCardColumns; i++) {
            html += '<div class="ui-block-' + ltr[i] +
                '"><table id="aeRouteCol-' + i +
                '" class="ui-body-d ui-shadow table-stripe aeRouteTable"><caption class="visuallyhidden">Score Card xxx </caption><thead></thead><tbody></tbody></table></div>';
            columnsRoutes.push([]);
        }
        $("#aeScoreCard").html(html);

        // split routes into columns
        for (i = 0; i < routes.length; i++) {
            route = routes[i];
            columnsRoutes[route.sheetColumn].push(route);
        }

        colSpec.push(scoreCardCol[0]);
        if (event.routesHaveLocation) {
            colSpec.push(scoreCardCol[1]);
        }
        if (event.routesHaveColor) {
            colSpec.push(scoreCardCol[2]);
        }
        colSpec.push(scoreCardCol[3]);

        for (i = 0; i < event.scoreCardColumns; i++) {
            $table = $("#aeRouteCol-" + i);
            util.renderTable($table, colSpec, columnsRoutes[i]);
        }
    }

    function fetchRoutes() {
        model.fetchRoutes(eventId)
            .done(function(data) {
                if (data.version !== event.version) {
                    console.log("xxx route version different from event version");
                }
                routes = data.routes;
                renderRoutes();
            })
            .fail(function(status, message) {
                app.showErrorMessage(status, "Failed to get routes", message);
            });
    }

    function newRoutes() {
        var i, c, ci,
            count = $("#aeRouteCount").val(),
            colCount = Math.ceil(count / event.scoreCardColumns);
        // xxx validate count

        routes = [];
        c = ci = 0;
        for (i = 0; i < count; i++) {
            routes.push({
                number: i + 1,
                location: "",
                color: "",
                points: "",
                sheetColumn: c,
                sheetRow: ci
            });
            ci += 1;
            if (ci >= colCount) {
                c += 1;
                ci = 0;
            }
        }
        renderRoutes();
    }

    // xxx need to update if columns changes or

    app.addPage({
        name: "adminEvent",
        init: function() {
            logger.debug(module, "Init page");

            $("#aeTabs").on("tabsactivate", function(e, ui) {
                var importColumns;

                if (ui.newPanel[0].id === "aeRoutesTab") {
                    console.log("xxx clicked on routes tab");
                    importColumns = "number";
                    if (event.routesHaveLocation) {
                        importColumns += ", location";
                    }
                    if (event.routesHaveColor) {
                        importColumns += ", color";
                    }
                    importColumns +=  ", points, row , column";
                    $("#aeImportColumns").text(importColumns);

                    if (routes === null) {
                        fetchRoutes();
                    }
                }
            });
            model.fetchRegions()
                .done(function(list) {
                    util.renderOptions($("#aeRegion"), list, {
                        valuesOnly: true
                    });
                });

            function save(done) {
                util.readForm(event, formMap);
                // xxx validation
                if (eventId !== "new") {
                    // update event
                    event.eventId = eventId;
                    model.updateEvent(event)
                        .done(function(data) {
                            if (done) {
                                $.mobile.changePage("#adminEvents");
                            } else {
                                event = data;
                                util.writeForm(event, formMap);
                            }
                        })
                        .fail(function(status, message) {
                            app.showErrorMessage(status, "Failed to update event", message);
                        });
                } else {
                    // create event
                    event.state = "Open";
                    model.createEvent(event)
                        .done(function() {
                            $.mobile.changePage("#adminEvents");
                        })
                        .fail(function(status, message) {
                            app.showErrorMessage(status, "Failed to create event", message);
                        });
                }
                // xxx save routes somehow. track what has changed? keep version in sync
            }

            $("#aeOK").click(function() {
                save(true);
            });
            $("#aeApply").click(function() {
                save(false);
            });

            $("#aeUpload").click(function() {
                app.clearMessage();
                if ($("#aeFile").val() === "") {
                    // xxx better messaging for validation errors
                    alert("Choose a file first.");
                    return;
                }
                model.uploadEventRoutes(event.eventId, event.routesHaveLocation, event.routesHaveColor,
                            event.scoreCardColumns, event.version,  $("#aeFile")[0].files[0])
                    .done(function() {
                        fetchRoutes();
                    })
                    .fail(function(status, message) {
                        app.showErrorMessage(status, "Failed to upload routes", message);
                    });
                $("#aeFile").val("");
            });
            $("#aeNewRoutes").click(function() {
                newRoutes();
            });
            $("#aeExport").click(function() {
                alert("Not yet supported. todo");
            });

        },
        prepare: function(ui) {
            app.clearMessage(this.name);

            $("#aeFile").val("");
            eventId = "";
            if (ui.args) {
                eventId = ui.args[0];
            }

            if (eventId !== "new") {
                // update event
                $("#aeOK").text("OK");
                $("#aeApply").show();
                $("#aeTabs").tabs("option", "disabled", false); // enable all tabs
                $("#aeTitle").text("Edit Event");
            } else {
                // create event
                // xxx where to get good defaults from?
                event = {
                    location: "",
                    region: "503 (New England East)",
                    series: "ABS",
                    type: "Red Point",
                    sanctioning: "Local",
                    recordFallsPerClimb: false,
                    routesHaveLocation: true,
                    routesHaveColor: true,
                    scoreCardColumns: 2
                };
                util.writeForm(event, formMap);
                $("#aeOK").text("Create");
                $("#aeApply").hide();
                $("#aeTabs").tabs("option", "disabled", [1,2]);
                $("#aeTitle").text("Create Event");
            }
        },
        open: function(ui) {
            logger.debug(module, "Page open");
            eventId = "";
            if (ui.args) {
                if (ui.args.length !== 1) {
                    logger.warn("Missing or invalid page arguments", ui.args);
                    $.mobile.changePage("#adminEvents");
                    return;
                }
                eventId = ui.args[0];
            }

            if (eventId !== "new") {
                loadEvent(true);
            }
        }
    });

})(app, appModel, jQuery, logger, util);
