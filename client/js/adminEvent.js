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
 * print scorecard
 */

(function(app, model, $, logger, util, undefined) {
    "use strict";

    var module = "AdminEvent",
        optionsInitialized = false,
        event = null,
        routes = null,
        eventId = null,
        formMap = [
            {id: "aeLocation", prop: "location"},
            {id: "aeRegion", prop: "region"},
            {id: "aeDate", prop: "date"},
            {id: "aeSeries", prop: "series"},
            // todo fixed at one round for now
            {id: "aeFormat", prop: "format"},
            {id: "aeNumRoutes", prop: "numRoutes"},
            {id: "aeSanctioning", prop: "sanctioning"},
            {id: "aeFallsPerClimb", prop: "recordFallsPerClimb"},
            {id: "aeBibNumDigits", prop: "bibNumberDigits"},
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

    var stateTransitions = {
        "Open": {
            state: "Active", // or active last
            label: "Begin Competition"
        },
        "Active": {
            state: "Preliminary",
            label: "Post Preliminary Results"
        },
        "Preliminary": {
            state: "Active", // or active last
            label: "Begin Next Round"
        },
        "ActiveLast": {
            state: "PreliminaryLast",
            label: "Post Preliminary Results"
        },
        "PreliminaryLast": {
            state: "Closed",
            label: "Complete Competition"
        },
        "Closed": {
            state: "Open",
            label: "Restart"
        }
    };

    function renderInput(value, r, c) {
        return "<input id='" + r + ":" + c + "' type='text' size='6' value='" + util.escapeHTML(value) + "'>";
    }

    function renderInputNumber(value, r, c) {
        return "<input id='" + r + ":" + c + "' type='text' size='4' value='" + util.escapeHTML(value) + "'>";
    }

    function getCurrentState( event ) {
        var state;
        state = event.state;
        if (event.currentRound === event.rounds.length && (state === "Active" || state === "Preliminary")) {
            state += "Last";
        }
        return state;
    }

    function loadEvent(returnOnError) {
        model.fetchEvent(eventId)
            .done(function(data) {
                var state;

                event = data;
                // xxx fixed at one round for now
                event.format = event.rounds[0].format;
                event.numRoutes = event.rounds[0].numRoutes;
                util.writeForm(event, formMap);
                state = getCurrentState(event);
                $("#aeChangeState").show().text( stateTransitions[state].label );
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

    function loadEventDefaults() {
        model.fetchEventDefaults()
            .done(function(data) {
                event = data;
                event.date = ""; // don't let this default
                event.format = event.rounds[0].format;
                event.numRoutes = event.rounds[0].numRoutes;
                util.writeForm(event, formMap);
            })
            .fail(function(status, message) {
                $.mobile.changePage("#adminEvents");
                app.showErrorMessage(status, "Failed to get event defaults", message);
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
                '" class="ui-body-d ui-shadow table-stripe aeRouteTable"><caption class="visuallyhidden">Scorecard xxx </caption><thead></thead><tbody></tbody></table></div>';
            columnsRoutes.push([]);
        }
        $("#aeScoreCard").html(html);

        $("#aeExport,#aePrint").toggle(routes.length);

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
        model.fetchRoutes(eventId, event.currentRound)
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
                var importColumns, href;

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

                    // xxx may need to do this if route settings changed such as has location etc.
                    if (routes === null) {
                        fetchRoutes();
                    }

                    href = "data/events/" + event.eventId + "/routes?round=" + event.currentRound;
                    $("#aeExport").attr("href", href + "&fmt=csv");
                    $("#aePrint").attr("href", href + "&fmt=pdf");

                }
            });

            function save(done) {
                util.readForm(event, formMap);
                // xxx validation

                // xxx fixed at one round for now
                event.rounds = [
                    {
                        format: event.format,
                        numRoutes: parseInt(event.numRoutes, 10),
                        numAdvance: null
                    }
                ];
                delete event.format;
                delete event.numRoutes;
                event.currentRound = 1;

                if (eventId !== "new") {
                    // update event
                    event.eventId = eventId;
                    model.updateEvent(event)
                        .done(function(data) {
                            if (done) {
                                $.mobile.changePage("#adminEvents");
                            } else {
                                event = data;
                                // xxx fixed at one round for now
                                event.format = event.rounds[0].format;
                                event.numRoutes = event.rounds[0].numRoutes;
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
                model.uploadEventRoutes(event.eventId, event.currentRound, event.routesHaveLocation, event.routesHaveColor,
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

            $("#aeManageClimbers").click(function() {
                $.mobile.changePage("#adminClimbers?" + eventId);
            });

            $("#aeChangeState").click(function() {
                var state = getCurrentState( event),
                    next = stateTransitions[state].state;

                if (next === "ActiveLast") {
                    next = "Active";
                } else if (next === "PreliminaryLast") {
                    next = "Preliminary";
                }
                // xxx increment current round if needed
                // xxx before going into active state check if climbers and routes have been defined
                // xxx before going into preliminary state check that all score cards have been entered
                // xxx restart should clear out results?
                event.state = next;
                save(true);
            });

            $("#aeExport").click(function(event) {
                model.authenticatedGet(this.href).done(function(data) {
                    console.log("xxx export data: ", data);
                });
                event.preventDefault();
            });
            $("#aePrint").click(function(event) {
                model.authenticatedGet(this.href).done(function(data) {
                    // xxx
                });
                event.preventDefault();
            });
        },
        prepare: function(ui) {
            if (!optionsInitialized) {
                optionsInitialized = true;
                model.fetchRegions()
                    .done(function (list) {
                        util.renderOptions($("#aeRegion"), list, {
                            valuesOnly: true
                        });
                    });
                // xxx need to fetch series, sanctioning etc.
            }

            app.clearMessage(this.name);

            $("#aeFile").val("");
            eventId = "";
            if (ui.args) {
                eventId = ui.args[0];
            }

            $("#aeChangeState").hide();
            if (eventId !== "new") {
                // update event
                $("#aeOK").text("OK");
                $("#aeApply").show();
                $("#aeManageClimbers").show();
                $("#aeTabs").tabs("option", "disabled", false); // enable all tabs
                $("#aeTitle").text("Edit Event");
            } else {
                // create event
                $("#aeOK").text("Create");
                $("#aeApply").hide();
                $("#aeManageClimbers").hide();
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

            routes = null;
            if (eventId !== "new") {
                loadEvent(true);
            } else {
                loadEventDefaults();
            }
        }
    });

})(app, appModel, jQuery, logger, util);
