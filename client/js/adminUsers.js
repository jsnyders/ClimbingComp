/*global jQuery, logger, app, appModel, util, alert*/
/*
 * Admin Users page
 * Copyright (c) 2014, John Snyders
 *
 * xxx todo
 * column selections should persist
 * create, edit, delete
 */

(function(app, model, $, logger, util, undefined) {
    "use strict";

    var module = "AdminUsers",
        usersColumns = [
        {prop: "username", label: "User Name", link: "adminUser", args: ["username"], icon: "ui-icon-edit"},
        {prop: "firstName", label: "First Name"},
        {prop: "lastName", label: "Last Name"},
        {prop: "role", label: "Role", format: function(role) { return model.getDisplayRole(role); }},
        {label: "Actions", action: "delete", icon: "ui-icon-delete", args: ["username", "version"]}
    ];

    app.addPage({
        name: "adminUsers",
        init: function() {
            $("#uUsersTable").on("click", "button", function(event) {
                var args,
                    btn$ = $(this);

                if (btn$.attr("data-action") === "delete") {
                    if (confirm("Ok to delete?")) { // xxx don't use confirm
                        args = btn$.attr("data-args").split("\n");
                        console.log("xxx todo delete" + args.join(":"));
                        model.deleteUser(args[0], args[1])
                            .done(function() {
                                $.mobile.changePage("#adminUsers");
                            })
                            .fail(function() {
                                alert("Failed to delete user"); // xxx
                            });
                    }
                }
            });

        },
        open: function(ui) {
            model.fetchUsers()
                .done(function(users) {
                    util.renderTable($("#uUsersTable"), usersColumns, users);
                    $("#uUsersTable").table("rebuild");
                })
                .fail(function() {
                    alert("Failed to get users"); // xxx reason, message area
                });
        }
    });


})(app, appModel, jQuery, logger, util);
