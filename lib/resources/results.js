/*
 results.js
 Resources related to event climber results

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
/* jshint node: true, strict: false */

var restify = require("restify");
var csv = require('csv');
var PDFdocument = require("pdfkit");
var auth = require("../auth");
var conv = require("../conv");
var errors = require("../errors");
var validate = require("../../common/validation");

var InvalidInput = errors.InvalidInput;

function addResources(server, dbPool) {
    var log = server.log;

    /*
     * Update event climber results
     *
     * URI: data/events/<event-id>/results/<climber-id>
     * Method: PUT
     * Role: Contributor
     * Input:
     * {
     *     version: <n> // the event_climber version
     *     top1:
     *     top2:
     *     top3:
     *     top4:
     *     top5:
     *     total_falls:
     *     total_points:
     *     climbs:
     * }
     * Output: xxx
     */
    server.put("data/events/:eventId/results/:bibNumber", function(req,res,next) {
        var eventId = conv.convertToIntegerId(req.params.eventId),
            bibNumber = conv.convertToIntegerId(req.params.bibNumber),
            input = req.body;

        if (!auth.validateAuthAndRole(auth.ROLE_CONTRIBUTOR, req, next)) {
            return;
        }

        if (conv.isInvalid(eventId)) {
            return next(new restify.ResourceNotFoundError("Invalid event id"));
        }
        if (conv.isInvalid(bibNumber)) {
            return next(new restify.ResourceNotFoundError("Invalid climber id"));
        }

        log.debug("Put event climber result: event id: " + eventId + ", bib number: " + bibNumber);

        // xxx validate input!

        dbPool.getConnection(function(err, conn) {
            var eventClimber;

            if (err) {
                return next(err);
            }
            eventClimber = {
                total: input.totalPoints,
                top1: input.top1,
                top2: input.top2,
                top3: input.top3,
                top4: input.top4,
                top5: input.top5,
                total_falls: input.totalFalls,
                climbs: JSON.stringify(input.climbs)
            };
            conn.query("UPDATE event_climber SET scored_on = NOW(), scored_by = ?, ?" +
                       "WHERE event_id = ? AND bib_number = ? AND version = ?;",
                       [req.authInfo.username, eventClimber, eventId, bibNumber, input.version], function(err, result) {
                conn.release();
                if (err) {
                    return next(err);
                }
                log.debug("Put climber result: update completed");

                if (result.affectedRows !== 1) {
                    conn.query("SELECT event_id FROM event_climber WHERE event_id = ? AND bib_number = ?", [eventId, bibNumber], function(err, rows) {
                        conn.release();
                        if (!err) {
                            if (rows.length !== 1) {
                                err = new restify.ResourceNotFoundError("No such event or climber");
                            } else {
                                err = new restify.ConflictError("Stale version");
                            }
                        }
                        return next(err);
                    });
                } else {
                    conn.query("SELECT bib_number, version, scored_by, scored_on FROM event_climber WHERE event_id = ? AND bib_number = ?", [eventId, bibNumber], function(err, rows) {
                        var row;

                        conn.release();
                        if (err) {
                            return next(err);
                        }
                        if (result.affectedRows !== 1) {
                            return new restify.InternalError("Not found after update");
                        } else {
                            row = rows[0];
                            // xxx return full resource?
                            res.send({
                                bibNumber: row.bib_number,
                                version: row.version,
                                scoredOn: row.scored_on, // xxx date
                                scoredBy: row.scored_by
                            });
                            next();
                        }
                    });
                }
            });

        });

    });

    var eventResultSQL =
        "SELECT ec.bib_number, c.usac_member_id, c.first_name, c.last_name, c.gender, ec.category, c.birth_date, ec.region, ec.team, scored_by, scored_on, " +
            "top1, top2, top3, top4, top5, total_falls, " +
            // xxx need total_falls to be capped at TOP_N
            "total_falls + if(top1 is null, 0, 1) + if(top2 is null, 0, 1) + if(top3 is null, 0, 1) /*xxx + if(top4 is null, 0, 1) + if(top5 is null, 0, 1)*/ as attempts, total " +
            "FROM event_climber ec, climber c " +
            "WHERE ec.climber_id = c.id AND ec.event_id = ? " +
            "ORDER BY category DESC, gender DESC, total DESC, total_falls ASC;";

    // optional params: ?fmt=export|print
    server.get("data/events/:eventId/results", function(req,res,next) {
        var eventId = conv.convertToIntegerId(req.params.eventId);

        // xxx this should be done client side, over the wire use a standard date string format
        function formatDate(bd) {
            var date = new Date(bd);
            return (date.getMonth() + 1) + "/" + date.getDate() + "/" + date.getFullYear();
        }

        console.log("xxx get event results: event id: " + eventId);
        if (conv.isInvalid(eventId)) {
            return next(new restify.ResourceNotFoundError("Invalid event id"));
        }

        dbPool.getConnection(function(err, conn) {
            var query;
            if (err) {
                return next(err);
            }
            query = conn.query(eventResultSQL, [eventId], function(err, rows) {
                var i, breakIndex, climber, row, br, place, csvWriter, doc, columns, lastFalls, lastTotal,
                    report = [],
                    lastBreak = null;

                conn.release();
                if (err) {
                    return next(err);
                }

                // xxx todo factor the loop out of each case
                lastTotal = null;
                lastFalls = null;
                if ( req.params.fmt === "export" ) {
                    console.log("xxx format for export");

                    // xxx name based on event
                    res.header("Content-Disposition", "attachment; filename=\"results.csv\"");
                    res.header("Content-Type", "application/csv");

                    csvWriter = csv();
                    csvWriter.to.string(function(data, count) {
                        res.send(data);
                        next();
                    }, {
                        delimiter: ",",
                        escape: '"',
                        lineBreaks: "windows"
                    });
                    // header
                    csvWriter.write([
                        "Bib Number", // should this be included xxx?
                        "Member Num",
                        "First Name",
                        "Last Name",
                        "Date of Birth",
                        "Gender",
                        "Category",
                        "Region",
                        "Team",
                        "Total", // in the spread sheet this is a formula xxx
                        "Place",
                        "Best Rt1",
                        "Best Rt2",
                        "Best Rt3",
                        "Best Rt4",
                        "Best Rt5",
                        "Falls",
                        "Attempts", // in the spread sheet this is called falls xxx did this change?
                        "Scored By"
                    ]);
                    for (i = 0; i < rows.length; i++) {
                        row = rows[i];

                        br = row.gender + row.category;
                        if (br !== lastBreak) {
                            place = 0;
                            breakIndex = 0;
                            lastTotal = null;
                            lastBreak = br;
                        }
                        if (row.total > 0 && !(row.total === lastTotal && row.total_falls === lastFalls)) {
                            place = breakIndex + 1;
                        }
                        csvWriter.write([
                            row.bib_number,
                            row.usac_member_id || "",
                            row.first_name,
                            row.last_name,
                            row.birth_date ? formatDate(row.birth_date) : "",
                            row.gender,
                            row.category,
                            row.region,
                            row.team || "",
                            row.total|| "",
                            row.total > 0 ? place : "",
                            row.top1 || "",
                            row.top2 || "",
                            row.top3 || "",
                            row.top4 || "",
                            row.top5 || "",
                            row.total_falls || "",
                            row.attempts,
                            row.scored_by
                        ]);
                        lastTotal = row.total;
                        lastFalls = row.total_falls;
                        breakIndex += 1;
                    }
                    csvWriter.end();
                } else if ( req.params.fmt === "pdf" ) { // xxx pdf
                    doc = new PDFdocument({
                        layout: "portrate",
                        size: "letter",
                        margins: {top: 36, right: 36, bottom: 36, left: 36}
                    });
                    doc.pipe(res);

                    columns = [
                        {label: "ID", prop: "bib_number"},
                        {label: "Member#", prop: "usac_member_id"},
                        {label: "First Name", prop: "first_name"},
                        {label: "Last Name", prop: "last_name"},
                        {label: "Total", prop: "total"},
                        {label: "Total Falls", prop: "total_falls"}
                    ];
                    console.log("xxx doc w, h" + doc.page.width + ", " + doc.page.height);
                    console.log("xxx doc x, y" + doc.x + ", " + doc.y);
                    doc.text("Results ... tbd");
                    console.log("xxx doc x, y" + doc.x + ", " + doc.y);

                    // writeTable(doc, columns, data, x, y, options)
                    // table begin xxx
                    var cellp = 10;
                    var j, col, cellx, celly;
                    var cellw = ((doc.page.width - doc.page.margins.left - doc.page.margins.right) / columns.length) - (2 * cellp);
                    var cellh = 20;
                    var tableTop = doc.y;
                    var tableLeft = doc.x;
                    cellx = doc.x + cellp;
                    celly = doc.y + cellp;
                    for (j = 0; j < columns.length; j++) {
                        col = columns[j];
                        doc.text(col.label, cellx, celly, {
                            width: cellw,
                            height: cellh
                        });
                        cellx += 2 * cellp + cellw;
                    }

                    doc.moveTo(tableLeft, tableTop)
                        .lineTo(tableLeft + doc.page.width, tableTop)
                        .stroke();

                    cellx = tableLeft;
                    celly = tableTop;
                    for (j = 0; j < columns.length + 1; j++) {
                        doc.moveTo(cellx, celly)
                            .lineTo(cellx, celly + cellh)
                            .stroke();
                        cellx += 2 * cellp + cellw;
                    }
                    doc.moveTo(tableLeft, tableTop + cellh)
                        .lineTo(tableLeft + doc.page.width, tableTop + cellh)
                        .stroke();

                    doc.end();
                    next();
                } else {
                    for (i = 0; i < rows.length; i++) {
                        row = rows[i];

                        br = row.gender + row.category;
                        if (br !== lastBreak) {
                            place = 0;
                            breakIndex = 0;
                            lastTotal = null;
                            lastBreak = br;
                        }
                        climber = {
                            bibNumber: row.bib_number,
                            usacMemberId: row.usac_member_id || "",
                            firstName: row.first_name,
                            lastName: row.last_name,
                            gender: row.gender,
                            category: row.category,
                            region: row.region,
                            team: row.team || "",
                            total: row.total > 0 ? row.total : '-', // xxx these "-" values are a display format issue that the client should handle 
                            place: '-',
                            top1: row.top1 || "-",
                            top2: row.top2 || "-",
                            top3: row.top3 || "-",
                            top4: row.top4 || "-",
                            top5: row.top5 || "-",
                            totalFalls: row.total_falls || "-"
                        };

                        // todo implement correct rules for breaking a tie - look at extra climbs and falls past TOP_N or previous rounds
                        if (row.total > 0) {
                            if (!(row.total === lastTotal && row.total_falls === lastFalls)) {
                                place = breakIndex + 1;
                            }
                            climber.place = place;
                        }
                        report.push(climber);
                        lastTotal = row.total;
                        lastFalls = row.total_falls;
                        breakIndex += 1;
                    }
                    res.send(report);
                }
                return next();
            });
        });

    });
}

module.exports = {
    addResources: addResources
};
