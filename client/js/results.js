/*global jQuery, logger, util, app, appModel, alert*/
/*
 * Copyright (c) 2014, John Snyders
 *
 * Results Page
 *
 * xxx todo
 * filters, stats
 * somewhere list all the climbers with incomplete cards
 */

(function(app, model, $, logger, util, undefined) {
    "use strict";

    var module = "Results",
        resultColumns = [
        {prop: "climberId", label: "ID"},
        {prop: "usacMemberId", label: "Member #", priority: '1'},
        {prop: "firstName", label: "First Name"},
        {prop: "lastName", label: "Last Name"},
        {prop: "region", label: "Region", priority: 3},
        {prop: "team", label: "Team", priority: 3},
        {prop: "total", label: "Total", num: true},
        {prop: "place", label: "Place", num: true},
        {prop: "top1", label: "Best 1", num: true, priority: 2},
        {prop: "top2", label: "Best 2", num: true, priority: 2},
        {prop: "top3", label: "Best 3", num: true, priority: 2},
        {prop: "top4", label: "Best 4", num: true, priority: 2},
        {prop: "top5", label: "Best 5", num: true, priority: 2},
        {prop: "totalFalls", label: "Falls", num: true, priority: 1}
    ];

    // xxx switch over to util.renderTable
    function renderResults(results) {
        var i, j, row, col, br,
            table = "",
            header = "",
            lastBreak = "",
            $table = $("#resTable");

        header += "<tr class='ui-bar-d'>";
        for (j = 0; j < resultColumns.length; j++) {
            col = resultColumns[j];
            if (col.priority) {
                header += "<th data-priority='" + col.priority + "'>" + col.label + "</th>";
            } else {
                header += "<th>" + col.label + "</th>";
            }
        }
        header += "</tr>";
        $table.children("thead").html(header);

        for (i = 0; i < results.length; i++) {
            row = results[i];
            table += "<tr>";
            br = row.gender + " " + row.category;
            if (br !== lastBreak) {
                table += "<td class='colbreak' colspan='14'>" + br + "</td></tr>" + header +  "<tr>";
                lastBreak = br;
            }
            for (j = 0; j < resultColumns.length; j++) {
                col = resultColumns[j];
                if (col.num) {
                    table += "<td class='num'>" + row[col.prop] + "</td>";
                } else {
                    table += "<td>" + row[col.prop] + "</td>";
                }
            }
            table += "</tr>";
        }
        $table.children("tbody").html(table);
    }

    app.addPage({
        name: "results",
        init: function() {
            logger.debug(module, "Init page");
        },
        open: function(ui) {
            var event = model.currentEvent;

            logger.debug(module, "Page is now active");

            if (!model.currentEvent) {
                $("body").pagecontainer("change", $("#home"));
                return;
            }

            $("#resExport").attr("href", "data/events/" + model.currentEvent.eventId + "/results?fmt=export");

            $("#resHeading").find(".ui-collapsible-heading-toggle")
                .text(event.sanctioning + " " + event.type + " " + event.series + " Climbing Event, " + event.location);

            $("#resDetails").html("<ul><li>Region: " + util.escapeHTML(event.region) + "</li><li>More details tbd</li></ul>");

            // clean out old results first
            $("#resTable").children("thead,tbody").empty();

            model.fetchEventResults()
                .done(function(results) {
                    renderResults(results);
                    $("#resTable").table("rebuild");
                })
                .fail(function() {
                    alert("Failed to get event results data"); // xxx reason, message area
                });
        }
    });

})(app, appModel, jQuery, logger, util);
