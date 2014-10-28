/*global jQuery, logger, app, appModel,util, alert*/
/*
 * Admin Events page
 * Copyright (c) 2014, John Snyders
 *
 * xxx todo
 * column selections should persist
 * date format
 * create, edit, delete
 */

(function(app, model, $, logger, util, undefined) {
    "use strict";

    var module = "AdminEvents",
        eventsColumns = [
        {prop: "location", label: "Location", link: "adminEvent", args: ["eventId"], icon: "ui-icon-edit"},
        {prop: "date", label: "Date"},
        {prop: "region", label: "Region", priority: 1},
        {prop: "series", label: "Series", priority: 2},
        {prop: "type", label: "Type", priority: 2},
        {prop: "sanctioning", label: "Sanctioning", priority: 2},
        {label: "Actions", action: "delete", icon: "ui-icon-delete", args: ["eventId", "version"]}
    ];

    app.addPage({
        name: "adminEvents",
        init: function(ui) {
            $("#eEventsTable").on("click", "button", function(event) {
                var args,
                    btn$ = $(this);

                if (btn$.attr("data-action") === "delete") {
                    if (confirm("Ok to delete?")) { // xxx don't use confirm
                        args = btn$.attr("data-args").split("\n");
                        console.log("xxx todo delete" + args.join(":"));
                        model.deleteEvent(args[0], args[1])
                            .done(function() {
                                $.mobile.changePage("#adminEvents");
                            })
                            .fail(function() {
                                alert("Failed to delete event"); // xxx
                            });
                    }
                }
            });
        },
        open: function(ui) {
            model.fetchEvents()
                .done(function() {
                    util.renderTable($("#eEventsTable"), eventsColumns, model.events);
                    $("#eventsTable").table("rebuild");
                })
                .fail(function() {
                    alert("Failed to get event results data"); // xxx reason, message area
                });
        }
    });

})(app, appModel, jQuery, logger, util);
