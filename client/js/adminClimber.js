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
        formMap = [
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

    function returnToList() {
        $.mobile.changePage("#adminClimbers?" + eventId);
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

            $("#acOK").click(function() {

                util.readForm(climber, formMap);
                // xxx validation

                if (climberId !== "new") {
                    // update climber
                    climber.climberId = climberId;
                    model.updateClimber(climber)
                        .done(function() {
                            returnToList();
                        })
                        .fail(function(status, message) {
                            app.showErrorMessage(status, "Failed to update climber", message);
                        });
                } else {
                    // create climber
                    model.createClimber(climber)
                        .done(function() {
                            returnToList();
                        })
                        .fail(function(status, message) {
                            app.showErrorMessage(status, "Failed to update climber", message);
                        });
                }
            });
        },
        prepare: function(ui) {
            app.clearMessage(this.name);
            eventId = null;
            climberId = null;
            if (ui.args && ui.args.length === 2) {
                console.log("xxx ui.args[1] typeof is " + typeof ui.args[1]);
                eventId = ui.args[0];
                climberId = ui.args[0]; // xxx verify it is already a number - don't think it is
            }

            if (climberId !== "new") {
                // update climber

                $("#acOK").text("OK");
                $("#acTitle").text("Edit Climber");
            } else {
                // create climber
                climber = {
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
                util.writeForm(climber, formMap);

                $("#acOK").text("Create");
                $("#acTitle").text("Create Climber");
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
                            util.writeForm(climber, formMap);
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
                            util.writeForm(climber, formMap); // xxx
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
