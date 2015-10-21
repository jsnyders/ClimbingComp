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
     *     version: {int} // the event_climber version
     *     round: {int}
     *     topPoints: [] // array of scores
     *     totalFalls: {int}
     *     tieBreaker: {string}
     *     climbs: {object}
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

        // xxx validate input! how far to take the validation. Can't know if climber really did top given routes
        // but could check that there are routes with those points. Probably not worth it.
        // xxx validate round integer between 1 and 3, topPoints array of numbers length less than the number of routes
        // version is a integer, tieBreaker is a string.

        dbPool.getConnection(function(err, conn) {
            if (err) {
                return next(err);
            }
            conn.query("SELECT id, state, current_round, round_1_num_routes, round_2_num_routes, round_3_num_routes " +
                        "FROM event WHERE id = ?;", [eventId], function (err, rows) {
                var i, event, eventClimber, startRoute;

                if (err) {
                    conn.release();
                    return next(err);
                }
                if (rows.length !== 1) {
                    return next(new restify.ResourceNotFoundError("No such event"));
                }

                event = rows[0];
                if (event.state !== "Active" && event.state !== "Preliminary") {
                    return next(new restify.ConflictError("Event is not active"));
                }

                if (input.round !== event.current_round) {
                    return next(new restify.ConflictError("Round is not current"));
                }

                startRoute = 1;
                for (i = 1; i < input.round; i++ ) {
                    startRoute += event["round_" + i + "_num_routes"];
                }
                eventClimber = {
                    total_falls: input.totalFalls,
                    tie_breaker: input.tieBreaker,
                    climbs: JSON.stringify(input.climbs)
                };
                for (i = 0; i < input.topPoints.length; i++) {
                    eventClimber["route_" + (startRoute + i) + "_score"] = input.topPoints[i];
                }

                conn.query("UPDATE event_climber SET scored_on = NOW(), scored_by = ?, ? " +
                            "WHERE event_id = ? AND bib_number = ? AND version = ?;",
                            [req.authInfo.username, eventClimber, eventId, bibNumber, input.version], function (err, result) {
                    conn.release();
                    if (err) {
                        return next(err);
                    }
                    log.debug("Put climber result: update completed");

                    if (result.affectedRows !== 1) {
                        conn.query("SELECT event_id FROM event_climber WHERE event_id = ? AND bib_number = ?", [eventId, bibNumber], function (err, rows) {
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
                        conn.query("SELECT bib_number, version, scored_by, scored_on FROM event_climber WHERE event_id = ? AND bib_number = ?", [eventId, bibNumber], function (err, rows) {
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

    });

    var eventResultsSQLPart1 = "SELECT ec.bib_number, c.usac_member_id, c.first_name, c.last_name, c.gender, ec.category, " + 
                "c.birth_date, ec.region, ec.team, scored_by, scored_on",
        eventResultsSQLPart2 = " FROM event_climber ec, climber c " +
            "WHERE ec.climber_id = c.id AND ec.event_id = ? " +
            "ORDER BY category DESC, gender DESC, total DESC, total_falls ASC, tie_breaker DESC;";

    /*
     * Get all ranked results for given event and round
     *
     * URI: data/events/<event-id>/results?round=<n>[&<fmt=<csv|pdf|json>]
     * Method: PUT
     * Role: Anyone
     * Output: depends on format
     */
    server.get("data/events/:eventId/results", function(req,res,next) {
        var eventId = conv.convertToIntegerId(req.params.eventId),
            round = conv.convertToInteger(req.params.round),
            resultFormat = req.params.fmt || "json";

        // this is for server side formatting such as in the csv or pdf case.
        function formatDate(date) {
            date = new Date(date);
            return (date.getMonth() + 1) + "/" + date.getDate() + "/" + date.getFullYear();
        }

        function formatDateForFilename(date) {
            date = new Date(date);
            return date.getFullYear() + "_" + (date.getMonth() + 1) + "_" + date.getDate();
        }

        if (conv.isInvalid(eventId)) {
            return next(new restify.ResourceNotFoundError("Invalid event id"));
        }

        if (conv.isInvalid(round) || round < 1 || round > 3) {
            return next(new restify.ResourceNotFoundError("Invalid round"));
        }

        dbPool.getConnection(function(err, conn) {
            var query;

            if (err) {
                return next(err);
            }

            // because of above validation round is integer 1, 2, or 3
            query = "SELECT id, location, event_date, num_rounds, round_1_num_routes, round_2_num_routes, round_" + 
                round + "_num_routes as num_routes, " +
                "round_" + round + "_format as format, round_" + 
                round + "_num_advance as num_advance " +
                "FROM event WHERE id = ?;";
            log.debug("Get event results event query: " + query);

            conn.query(query, [eventId], function (err, rows) {
                var i, col, event, query, routeOffset, routes, total, attempts;

                if (err) {
                    conn.release();
                    return next(err);
                }
                if (rows.length !== 1) {
                    conn.release();
                    return next(new restify.ResourceNotFoundError("No such event"));
                }

                event = rows[0];

                if (round > event.num_rounds) {
                    conn.release();
                    return next(new restify.ResourceNotFoundError("No such round"));
                }

                routeOffset = 1;
                for (i = 1; i < round; i++) {
                    routeOffset += event["round_" + i + "_num_routes"];
                }

                // xxx the rest is format specific TODO make use of format and num_advance

                // build the query
                routes = "";
                total = ", ";
                attempts = ", tie_breaker, total_falls, total_falls";
                for (i = 0; i < event.num_routes; i++) {
                    col = "ec.route_" + (routeOffset + i) + "_score";
                    routes += ", " + col + " as top" + (i + 1);
                    if (i > 0) {
                        total += " + ";
                    }
                    total += "if(" + col + " is null, 0, " + col + ")";
                    attempts += " + if(" + col + " is null, 0, 1)";
                }
                total += " as total";
                attempts += " as attempts";

                query = eventResultsSQLPart1 + routes + total + attempts + eventResultsSQLPart2;
                log.debug("Get event results event_climber query: " + query);

                conn.query(query, [eventId], function (err, rows) {
                    var i, j, breakIndex, climber, row, br, place, csvWriter, doc, columns, 
                        lastTieBreaker, lastFalls, lastTotal, route,
                        report = [],
                        lastBreak = null;

                    conn.release();
                    if (err) {
                        return next(err);
                    }

                    lastTotal = null;
                    lastFalls = null;
                    lastTieBreaker = null;
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
                            birthDate: row.birth_date,
                            gender: row.gender,
                            category: row.category,
                            region: row.region,
                            team: row.team || "",
                            total: row.total > 0 ? row.total : null,
                            place: null,
                            totalFalls: row.total_falls,
                            attempts: row.attempts,
                            scoredBy: row.scored_by,
                            scoredOn: row.scored_on
                        };
                        for (j = 0; j < event.num_routes; j++) {
                            route = "top" + (j + 1);
                            climber[route] = row[route];
                        }

                        // todo implement correct rules for breaking a tie - look at extra climbs and falls past TOP_N or previous rounds
                        if (row.total > 0) {
                            if (row.total === lastTotal && row.total_falls === lastFalls) {
                                // there is a tie based on the top n climbs and total falls
                                if (row.tie_breaker === lastTieBreaker) {
                                    // there is a tie that must stand
                                    if (row.tie_breaker === "") {
                                        // unless there is no tie breaker information in which case it could be that
                                        // additional data from the score card could be entered that would break the tie
                                        climber.note = "It may be possible to break this tie by entering additional climbs and falls from the tied score cards.";
                                    }
                                } else {
                                    // the tie was broken by looking at additional climbs and falls in the tie breaker field
                                    // xxx be more specific about how many additional routes
                                    climber.note = "Tie broken by including additional climbs and falls. Double check score cards.";
                                    // no tie
                                    place = breakIndex + 1;
                                }
                            } else {
                                // no tie
                                place = breakIndex + 1;
                            }
                            climber.place = place;
                        }
                        report.push(climber);
                        lastTotal = row.total;
                        lastFalls = row.total_falls;
                        lastTieBreaker = row.tie_breaker;
                        breakIndex += 1;
                    }

                    if (resultFormat === "csv") {
                        res.header("Content-Disposition", "attachment; filename=\"" + 
                            event.location.replace(/[\/: \t]/g, "_") + "_" + formatDateForFilename(event.event_date) + ".csv\"");
                        res.header("Content-Type", "application/csv");

                        csvWriter = csv();
                        csvWriter.to.string(function (data, count) {
                            res.send(data);
                            next();
                        }, {
                            delimiter: ",",
                            escape: '"',
                            rowDelimiter: "windows"
                        });
                        // header
                        columns = [
                            "Bib Number",
                            "Member Num",
                            "First Name",
                            "Last Name",
                            "Date of Birth",
                            "Gender",
                            "Category",
                            "Region",
                            "Team",
                            "Total",
                            "Place"
                        ];
                        for (j = 0; j < event.num_routes; j++) {
                            columns.push("Best Rt" + (j + 1));
                        }
                        columns.push("Falls");
                        columns.push("Attempts");
                        columns.push("Scored By");
                        csvWriter.write(columns);

                        for (i = 0; i < report.length; i++) {
                            row = report[i];

                            columns = [
                                row.bibNumber,
                                row.usacMemberId,
                                row.firstName,
                                row.lastName,
                                formatDate(row.birthDate),
                                row.gender,
                                row.category,
                                row.region,
                                row.team,
                                row.total,
                                row.place
                            ];

                            for (j = 0; j < event.num_routes; j++) {
                                route = "top" + (j + 1);
                                columns.push(row[route]);
                            }

                            columns.push(row.totalFalls);
                            columns.push(row.attempts);
                            columns.push(row.scoredBy);

                            csvWriter.write(columns);
                        }
                        csvWriter.end();
                    } else if (resultFormat === "pdf") {
                        doc = new PDFdocument({
                            layout: "landscape",
                            size: "letter",
                            margins: {top: 36, right: 36, bottom: 36, left: 36}
                        });
                        // xxx add doc.info
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
                        var col, cellx, celly;
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
                        return next();
                    } else {
                        // must be json
                        res.send(report);
                        return next();
                    }
                });
            });
        });
    });
}

module.exports = {
    addResources: addResources
};
