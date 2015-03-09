/*global jQuery, logger, app, appModel,util*/
/*
 Admin Events page

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
 * column selections should persist
 */

(function(app, model, $, logger, util, undefined) {
    "use strict";

    var module = "AdminEvents",
        eventsColumns = [
            {prop: "location", label: "Location", link: "adminEvent", args: ["eventId"], icon: "ui-icon-edit"},
            {prop: "date", label: "Date", format: function(value, r, c) {
                return util.formatDate(value);
            }},
            {prop: "region", label: "Region", priority: 1},
            {prop: "series", label: "Series", priority: 1},
            {prop: "type", label: "Type", priority: 2},
            {prop: "sanctioning", label: "Sanctioning", priority: 2},
            {label: "Actions", action: "delete", icon: "ui-icon-delete", args: ["eventId", "version", "location"]}
        ];

    app.addPage({
        name: "adminEvents",
        init: function(ui) {
            $("#eEventsTable").on("click", "button", function(event) {
                var args,
                    btn$ = $(this);

                if (btn$.attr("data-action") === "delete") {
                    args = btn$.attr("data-args").split("\n");
                    if (confirm("Ok to delete event '"+ args[2] + "'?")) { // xxx don't use confirm
                        model.deleteEvent(args[0], args[1])
                            .done(function() {
                                $.mobile.changePage("#adminEvents");
                            })
                            .fail(function(status, message) {
                                app.showErrorMessage(status, "Failed to delete event", message);
                            });
                    }
                }
            });
        },
        prepare: function() {
            app.clearMessage(this.name);
            app.updateFooter();
        },
        open: function(ui) {
            model.fetchEvents()
                .done(function() {
                    util.renderTable($("#eEventsTable"), eventsColumns, model.events);
                    $("#eEventsTable").table("rebuild");
                })
                .fail(function(status, message) {
                    app.showErrorMessage(status, "Failed to get events", message);
                });
        }
    });

})(app, appModel, jQuery, logger, util);
