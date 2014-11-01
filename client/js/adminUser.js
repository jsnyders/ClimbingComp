/*global jQuery, logger, app, appModel, util*/
/*
 Admin User page
 Create or edit a user

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
 */

(function(app, model, $, logger, util, undefined) {
    "use strict";

    var module = "AdminUser",
        user = null,
        username = null,
        formMap = [
            {id: "auUsername", prop: "username"},
            {id: "auFirstName", prop: "firstName"},
            {id: "auLastName", prop: "lastName"},
            {id: "auRole", prop: "role"}
        ];

    app.addPage({
        name: "adminUser",
        init: function() {
            logger.debug(module, "Init page");

            $("#auOK").click(function() {
                var pw1, pw2;

                util.readForm(user, formMap);
                // xxx validation
                if (username !== "") {
                    // update user
                    user.username = username;
                    model.updateUser(user)
                        .done(function() {
                            $.mobile.changePage("#adminUsers");
                        })
                        .fail(function(status, message) {
                            app.showErrorMessage(status, "Failed to update user", message);
                        });
                } else {
                    // create user
                    pw1 = $("#auPassword").val();
                    pw2 = $("#auPasswordConfirm").val();
                    $("#auPassword").val("");
                    $("#auPasswordConfirm").val("");
                    if (pw1.length <= 0) {
                        app.showMessage("Invalid Input", "Password is required");
                        return;
                    }
                    if (pw1 !== pw2) {
                        app.showMessage("Invalid Input", "password confirmation did not match");
                        return;
                    }
                    user.password = pw1;
                    model.createUser(user)
                        .done(function() {
                            $.mobile.changePage("#adminUsers");
                        })
                        .fail(function(status, message) {
                            app.showErrorMessage(status, "Failed to update user", message);
                        });
                }
            });
        },
        prepare: function(ui) {
            app.clearMessage(this.name);
            username = "";
            if (ui.args) {
                username = ui.args[0];
            }

            if (username !== "") {
                // update user
                $(".ui-field-contain.pw").hide();
                $("#auPassword").val("");
                $("#auPasswordConfirm").val("");
                $("#auUsername").prop("readonly", true);
                $("#auOK").text("OK");
                $("#auTitle").text("Edit User");
            } else {
                // create user
                user = {
                    username: "",
                    firstName: "",
                    lastName: "",
                    role: "Reader"
                };
                util.writeForm(user, formMap);
                $("#auPassword").val("");
                $("#auPasswordConfirm").val("");
                $(".ui-field-contain.pw").show();
                $("#auUsername").prop("readonly", false);
                $("#auOK").text("Create");
                $("#auTitle").text("Create User");
            }
        },
        open: function(ui) {
            logger.debug(module, "Init open");
            username = "";
            if (ui.args) {
                if (ui.args.length !== 1) {
                    logger.warn("Missing or invalid page arguments", ui.args);
                    $.mobile.changePage("#adminUsers");
                    return;
                }
                username = ui.args[0];
            }

            if (username !== "") {
                // update user
                model.fetchUser(username)
                    .done(function(data) {
                        user = data;
                        util.writeForm(user, formMap);
                    })
                    .fail(function(status, message) {
                        $.mobile.changePage("#adminUsers");
                        app.showErrorMessage(status, "Failed to get user", message);
                    });
            }
        }
    });

})(app, appModel, jQuery, logger, util);
