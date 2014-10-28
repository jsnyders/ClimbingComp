/*global jQuery, logger, app, appModel, util, alert*/
/*
 * Admin User page
 * Copyright (c) 2014, John Snyders
 *
 * Create or edit a user
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
                        .fail(function() {
                            alert("Failed to update user"); // xxx
                        });
                } else {
                    // create user
                    pw1 = $("#auPassword").val();
                    pw2 = $("#auPasswordConfirm").val();
                    $("#auPassword").val("");
                    $("#auPasswordConfirm").val("");
                    if (pw1.length <= 0) {
                        alert("password is required"); // xxx
                        return;
                    }
                    if (pw1 !== pw2) {
                        alert("password confirmation did not match"); //xxx
                        return;
                    }
                    user.password = pw1;
                    model.createUser(user)
                        .done(function() {
                            $.mobile.changePage("#adminUsers");
                        })
                        .fail(function() {
                            alert("Failed to create user"); // xxx
                        });
                }
            });
        },
        prepare: function(ui) {
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
                    .fail(function() {
                        alert("Failed to get user"); // xxx reason, message area
                        $.mobile.changePage("#adminUsers");
                    });
            }
        }
    });

})(app, appModel, jQuery, logger, util);
