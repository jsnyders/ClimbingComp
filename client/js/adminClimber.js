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
        climberId = null,
        formMap = [
            {id: "acMemberId", prop: "usacMemberId"},
            {id: "acFirstName", prop: "firstName"},
            {id: "acLastName", prop: "lastName"},
            {id: "acLocation", prop: "location"},
            {id: "acGender", prop: "gender"},
            {id: "acCategory", prop: "category"},
            {id: "acBirthYear", prop: "birthYear"},
            {id: "acBirthDate", prop: "birthDate"},
            {id: "acRegion", prop: "region"},
            {id: "acTeam", prop: "team"},
            {id: "acCoach", prop: "coach"}
        ];

    app.addPage({
        name: "adminClimber",
        init: function() {
            logger.debug(module, "Init page");

            $("#acOK").click(function() {
                var pw1, pw2;

                util.readForm(climber, formMap);
                // xxx validation

                if (climberId !== "new") {
                    // update climber
                    climber.climberId = climberId;
                    model.updateClimber(climber)
                        .done(function() {
                            $.mobile.changePage("#adminClimbers");
                        })
                        .fail(function(status, message) {
                            app.showErrorMessage(status, "Failed to update climber", message);
                        });
                } else {
                    // create climber
                    model.createClimber(climber)
                        .done(function() {
                            $.mobile.changePage("#adminClimbers");
                        })
                        .fail(function(status, message) {
                            app.showErrorMessage(status, "Failed to update climber", message);
                        });
                }
            });
        },
        prepare: function(ui) {
            app.clearMessage(this.name);
            climberId = null;
            if (ui.args) {
                console.log("xxx ui.args[0] typeof is " + typeof ui.args[0]);
                climberId = ui.args[0]; // xxx verify it is already a number
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
                    location: "",
                    gender: "",
                    category: "",
                    birthYear: "",
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
                if (ui.args.length !== 1) {
                    logger.warn("Missing or invalid page arguments", ui.args);
                    $.mobile.changePage("#adminClimbers");
                    return;
                }
                climberId = ui.args[0];
            }

            if (climberId !== "new") {
                model.fetchClimber(climberId)
                    .done(function(data) {
                        climber = data;
                        util.writeForm(climber, formMap);
                    })
                    .fail(function(status, message) {
                        $.mobile.changePage("#adminClimbers");
                        app.showErrorMessage(status, "Failed to get climber", message);
                    });
            }
        }
    });

})(app, appModel, jQuery, logger, util);
