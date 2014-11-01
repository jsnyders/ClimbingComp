/*global jQuery, logger, app, appModel, util*/
/*
 Admin Users page
 List and delete users.

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
 * column selections should persist
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
                        model.deleteUser(args[0], args[1])
                            .done(function() {
                                $.mobile.changePage("#adminUsers");
                            })
                            .fail(function(status, message) {
                                app.showErrorMessage(status, "Failed to delete user", message);
                            });
                    }
                }
            });

        },
        prepare: function() {
            app.clearMessage(this.name);
        },
        open: function(ui) {
            model.fetchUsers()
                .done(function(users) {
                    util.renderTable($("#uUsersTable"), usersColumns, users);
                    $("#uUsersTable").table("rebuild");
                })
                .fail(function(status, message) {
                    app.showErrorMessage(status, "Failed to get users", message);
                });
        }
    });


})(app, appModel, jQuery, logger, util);
