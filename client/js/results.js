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
            {prop: "bibNumber", label: "Bib #"}, // xxx link to score card
            {prop: "usacMemberId", label: "Member #", priority: '1'},
            {prop: "firstName", label: "First Name"},
            {prop: "lastName", label: "Last Name"},
            {prop: "region", label: "Region", priority: 3},
            {prop: "team", label: "Team", priority: 3},
            {prop: "place", label: "Place", cls: "num", format: function(value, row, rowIndex) {
                var id;
                if (row.note) {
                    id = "resultPopup" + rowIndex;
                    return "<a href='#" + id + "' data-rel='popup' data-transition='pop' " +
                           "class='info-btn ui-btn ui-alt-icon ui-nodisc-icon ui-btn-inline ui-icon-info ui-btn-icon-notext' title='Details'>Details</a> " +
                           "<div id='"+ id + "' class='dyn-popup ui-content' data-theme='a' style='max-width:350px;'>" + row.note + "</div>" + value;
                } else {
                    return value || "";
                }
            }},
            {prop: "total", label: "Total", cls: "num"}
        ];

    function renderResults(results) {
        var i, columns,
            event = model.currentEvent,
            top_n = event.rounds[event.currentRound - 1].numRoutes,
            $table = $("#resTable");

        columns = [];
        for (i = 0; i < resultColumns.length; i++) {
            columns.push(resultColumns[i]);
        }

        // xxx option to show attempts vs falls
        columns.push({
            prop: "totalFalls", label: "Falls", cls: "num", priority: 1
        });

        for (i = 0; i < top_n; i++) {
            columns.push({
                prop: "top" + (i + 1), label: "Best " + (i + 1), cls: "num", priority: 2
            });
        }

        util.renderTable($table, columns, results, {
            breakOn: function(row) {
                return row.gender + " " + row.category;
            },
            nullValue: "-"
        });
        $table.find(".dyn-popup").popup();
    }

    app.addPage({
        name: "results",
        init: function() {
            logger.debug(module, "Init page");
        },
        open: function(ui) {
            var href,
                event = model.currentEvent;

            logger.debug(module, "Page is now active");

            if (!model.currentEvent) {
                $("body").pagecontainer("change", $("#home"));
                return;
            }

            href = "data/events/" + model.currentEvent.eventId + "/results?round=" + model.currentEvent.currentRound;
            $("#resExport").attr("href", href + "&fmt=csv");
            $("#resPrint").attr("href", href + "&fmt=pdf");

            $("#resHeading").find(".ui-collapsible-heading-toggle")
                .text(event.sanctioning + " " + event.series + " Climbing Event, " + event.location);

            $("#resDetails").html("<ul><li>Region: " + util.escapeHTML(event.region) + "</li><li>More details tbd</li></ul>"); //xxx add details

            // clean out old results first
            $("#resTable").children("thead,tbody").empty();

            model.fetchEventResults(event.eventId, event.currentRound)
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
