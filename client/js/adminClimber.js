/*global jQuery, logger, app, appModel, util*/
/*
 Admin Climber page
 Create or edit a Climber

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
/*
 * xxx todo
 */
(function(app, model, $, logger, util, undefined) {
    "use strict";

    var module = "AdminClimber",
        climber = null,
        eventId = null,
        climberId = null,
        formClimberMap = [
            {id: "acMemberId", prop: "usacMemberId"},
            {id: "acFirstName", prop: "firstName"},
            {id: "acLastName", prop: "lastName"},
            {id: "acGender", prop: "gender"},
            {id: "acCategory", prop: "category"},
            {id: "acBirthDate", prop: "birthDate"}, // xxx
            {id: "acRegion", prop: "region"},
            {id: "acTeam", prop: "team"},
            {id: "acCoach", prop: "coach"}
        ],
        formEventClimberMap = [
            {id: "acBibNumber", prop: "bibNumber"},
            {id: "acMemberId", prop: "usacMemberId"},
            {id: "acFirstName", prop: "firstName"},
            {id: "acLastName", prop: "lastName"},
            {id: "acGender", prop: "gender"},
            {id: "acCategory", prop: "category"},
            {id: "acBirthDate", prop: "birthDate"}, // xxx
            {id: "acRegion", prop: "region"},
            {id: "acTeam", prop: "team"},
            {id: "acCoach", prop: "coach"}
        ];


    function getEventLabel(eventId) {
        var i, event;
        for (i = 0; i < model.events.length; i++) {
            event = model.events[i];
            if (event.eventId === eventId) {
                return "Event at " + util.escapeHTML(event.location) + " on " + util.formatDate(event.date);
            }
        }
        return "";
    }

    function returnToList() {
        $.mobile.changePage("#adminClimbers?" + eventId);
    }

    function lookupClimber(fn) {
        var filters = [],
            memberId = $("#acMemberId").val(),
            firstName = $("#acFirstName").val(),
            lastName = $("#acLastName").val();
        if (memberId) {
            filters.push("usacMemberId:eq:" + memberId);
        } else if (firstName && lastName) {
            filters.push("firstName:c:" + firstName);
            filters.push("lastName:c:" + lastName);
        }
        model.fetchClimbers(filters)
            .done(fn)
            .fail(function() {
                fn(null);
            });
    }

    function createNewEventClimber(eventClimber) {
        util.readForm(climber, formClimberMap);
        console.log("xxx add to master climber list first");
        model.createClimber(climber)
            .done(function (climber) {
                // now add to event
                console.log("xxx now add to event");
                eventClimber.climberId = climber.climberId;
                model.createEventClimber(eventId, eventClimber)
                    .done(function () {
                        returnToList();
                    })
                    .fail(function (status, message) {
                        app.showErrorMessage(status, "Failed to create event climber", message);
                    });
                returnToList();
            })
            .fail(function (status, message) {
                app.showErrorMessage(status, "Failed to create climber", message);
            });
    }

    function addExistingEventClimber(climberId, eventClimber) {
        // found the climber so just add to event
        console.log("xxx found climber so just add to event");
        eventClimber.climberId = climberId;
        model.createEventClimber(eventId, eventClimber)
            .done(function () {
                returnToList();
            })
            .fail(function (status, message) {
                app.showErrorMessage(status, "Failed to create event climber", message);
            });
    }

    app.addPage({
        name: "adminClimber",
        init: function() {
            logger.debug(module, "Init page");

            model.fetchGenders()
                .done(function(list) {
                    util.renderOptions($("#acGender"), list, {
                        valuesOnly: true
                    });
                });

            model.fetchCategories()
                .done(function(list) {
                    util.renderOptions($("#acCategory"), list, {
                        valuesOnly: true
                    });
                });

            model.fetchRegions()
                .done(function(list) {
                    util.renderOptions($("#acRegion"), list, {
                        valuesOnly: true
                    });
                });

            $("#acBirthDate").date({
                changeYear: true,
                maxDate: new Date(),
                yearRange: "-60:+0"
            });

            $("#acCancel").click(function() {
                returnToList();
            });

            $("#acMemberId,#acLastName,#acFirstName").change(function() {
                if (eventId === "m") {
                    return; // when editing the master list of climbers don't look up the climber in the master list
                }
                lookupClimber(function(climbers) {
                    var climber;
                    if (climbers && climbers.length === 1) {
                        climber = climbers[0];
                        util.writeForm(climber, formClimberMap);
                    }
                });
            });

            $("#acOK").click(function() {
                var eventClimber;

                // xxx validation
                if (eventId === "m") {
                    util.readForm(climber, formClimberMap);
                    if (climberId !== "new") {
                        // update climber
                        climber.climberId = climberId;
                        model.updateClimber(climber)
                            .done(function () {
                                returnToList();
                            })
                            .fail(function (status, message) {
                                app.showErrorMessage(status, "Failed to update climber", message);
                            });
                    } else {
                        // create climber
                        model.createClimber(climber)
                            .done(function () {
                                returnToList();
                            })
                            .fail(function (status, message) {
                                app.showErrorMessage(status, "Failed to create climber", message);
                            });
                    }
                } else {
                    util.readForm(climber, formEventClimberMap);
                    // this is for an event climber
                    // copy just the writable properties
                    eventClimber = {
                        bibNumber: climber.bibNumber,
                        category: climber.category,
                        region: climber.region,
                        team: climber.team,
                        coach: climber.coach
                    };
                    if (climberId !== "new") {
                        // update climber
                        eventClimber.climberId = climberId;
                        eventClimber.version = climber.version;
                        model.updateEventClimber(eventId, eventClimber)
                            .done(function () {
                                returnToList();
                            })
                            .fail(function (status, message) {
                                app.showErrorMessage(status, "Failed to update event climber", message);
                            });
                    } else {
                        // create climber
                        // look for matching climber in master climber list
                        lookupClimber(function(climbers) {
                            var i, html, c;
                            if (climbers.length === 0) {
                                createNewEventClimber(eventClimber);
                            } else if (climbers.length === 1) {
                                addExistingEventClimber(climbers[0].climberId, eventClimber);
                            } else {
                                // multiple climbers
                                html = "";
                                html += "<input name='acMatches' id='acc_none' type='radio' value=''><label for='acc_none'>New climber</label>";
                                for (i = 0; i < climbers.length; i++) {
                                    c = climbers[i];
                                    html += "<input name='acMatches' id='acc_" + i + "' type='radio' value='" + c.climberId + "'><label for='acc_" + i + "'>" +
                                        c.usacMemberId + " " + c.firstName + " " + c.lastName + " " + c.gender + " " + c.region + "</label>";
                                }
                                $("#acClimberMatches").html(html).children().each(function() {
                                    $(this).checkboxradio({});
                                });
                                $("#acChooseClimber").popup("open");
                            }
                        });

                    }
                }
            });
            $("#acCreate").click(function() {
                var eventClimber,
                    id = $("#acClimberMatches").find("input:checked").val();

                console.log("xxx clientId " + id);

                $("#acChooseClimber").popup("close");
                util.readForm(climber, formEventClimberMap);
                // this is for an event climber
                // copy just the writable properties
                eventClimber = {
                    bibNumber: climber.bibNumber,
                    category: climber.category,
                    region: climber.region,
                    team: climber.team,
                    coach: climber.coach
                };
                if (id === "") {
                    createNewEventClimber(eventClimber);
                } else {
                    addExistingEventClimber(id, eventClimber);
                }
            });
        },
        prepare: function(ui) {
            app.clearMessage(this.name);
            eventId = null;
            climberId = null;
            if (ui.args && ui.args.length === 2) {
                eventId = ui.args[0];
                climberId = ui.args[1];
            }

            if (eventId === "m") {
                $("#acBibNumber, #acEvent").closest(".ui-field-contain").hide();
                $("#acMemberId, #acFirstName, #acLastName, #acBirthDate, #acGender").each(function() {
                    this.disabled = false;
                    $(this).closest(".ui-field-contain").removeClass("ui-disabled");
                });
            } else {
                $("#acBibNumber, #acEvent").closest(".ui-field-contain").show();
                $("#acEvent").text(getEventLabel(parseInt(eventId,10)));
                // xxx enable button to edit climber???
                $("#acMemberId, #acFirstName, #acLastName, #acBirthDate, #acGender").each(function() {
                    this.disabled = climberId !== "new";
                    $(this).closest(".ui-field-contain").toggleClass("ui-disabled", this.disabled);
                });
            }

            if (climberId !== "new") {
                // update climber

                $("#acOK").text("OK");
                $("#acTitle").text("Edit Climber");
            } else {
                // create climber
                climber = {
                    bibNumber: "",
                    usacMemberId: "",
                    firstName: "",
                    lastName: "",
                    gender: "",
                    category: "",
                    birthDate: "",
                    region: "",
                    team: "",
                    coach: ""
                };
                util.writeForm(climber, formEventClimberMap); // OK to do this because it is a superset of both

                $("#acOK").text("Create");
                $("#acTitle").text("Add Climber");
            }
        },
        open: function(ui) {
            logger.debug(module, "Page open");
            climberId = null;
            if (ui.args) {
                if (ui.args.length !== 2) {
                    logger.warn("Missing or invalid page arguments", ui.args);
                    $.mobile.changePage("#adminClimbers?m");
                    return;
                }
                eventId = ui.args[0];
                climberId = ui.args[1];
            }

            if (climberId !== "new") {
                if (eventId === "m") {
                    model.fetchClimber(climberId)
                        .done(function (data) {
                            climber = data;
                            util.writeForm(climber, formClimberMap);
                        })
                        .fail(function (status, message) {
                            returnToList();
                            // xxx where does this go?
                            app.showErrorMessage(status, "Failed to get climber", message);
                        });
                } else {
                    model.fetchEventClimber(eventId, climberId)
                        .done(function (data) {
                            climber = data;
                            util.writeForm(climber, formEventClimberMap);
                        })
                        .fail(function (status, message) {
                            returnToList();
                            // xxx where does this go?
                            app.showErrorMessage(status, "Failed to get event climber", message);
                        });
                }
            }
        }
    });

})(app, appModel, jQuery, logger, util);
