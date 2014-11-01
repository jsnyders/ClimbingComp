/*
 results.js
 Resources related to event climber results

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
/* jshint node: true, strict: false */

var restify = require("restify");
var csv = require('csv');
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
     *     score: <n>
     *     top1:
     *     top2:
     *     top3:
     *     top4:
     *     top5:
     *     total_falls:
     *     total_points: //xxx?
     *     climbs:
     * }
     * Output: xxx
     */
    server.put("data/events/:eventId/results/:climberId", function(req,res,next) {
        var eventId = conv.convertToIntegerId(req.params.eventId),
            climberId = conv.convertToIntegerId(req.params.climberId),
            input = req.body;

        if (!auth.validateAuthAndRole(auth.ROLE_CONTRIBUTOR, req, next)) {
            return;
        }

        if (conv.isInvalid(eventId)) {
            return next(new restify.ResourceNotFoundError("Invalid event id"));
        }
        if (conv.isInvalid(climberId)) {
            return next(new restify.ResourceNotFoundError("Invalid climber id"));
        }

        log.debug("Put event climber result: event id: " + eventId + ", climber id: " + climberId);

        // xxx validate input!

        dbPool.getConnection(function(err, conn) {
            var eventClimber;

            if (err) {
                return next(err);
            }
            eventClimber = {
                total: input.score,
                top1: input.top1,
                top2: input.top2,
                top3: input.top3,
                top4: input.top4,
                top5: input.top5,
                total_falls: input.totalFalls,
                climbs: JSON.stringify(input.climbs)
            };
            conn.query("UPDATE event_climber SET scored_on = NOW(), scored_by = ?, ?" +
                       "WHERE event_id = ? AND number = ? AND version = ?;",
                       [req.authInfo.username, eventClimber, eventId, climberId, input.version], function(err, result) {
                conn.release();
                if (err) {
                    return next(err);
                }
                log.debug("Put climber result: update completed");

                if (result.affectedRows !== 1) {
                    conn.query("SELECT event_id FROM event_climber WHERE event_id = ? AND number = ?", [eventId, climberId], function(err, rows) {
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
                    conn.query("SELECT number, version, scored_by, scored_on FROM event_climber WHERE event_id = ? AND number = ?", [eventId, climberId], function(err, rows) {
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
                                climberId: row.number,
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
        "SELECT number, usac_member_id, first_name, last_name, gender, category, birth_year, birth_date, region, team, scored_by, scored_on, " +
            "top1, top2, top3, top4, top5, total_falls, " +
            "total_falls + if(top1 is null, 0, 1) + if(top2 is null, 0, 1) + if(top3 is null, 0, 1) + if(top4 is null, 0, 1) + if(top5 is null, 0, 1) as attempts," +
            "(ifnull(top1, 0) + ifnull(top2, 0) + ifnull(top3, 0) + ifnull(top4, 0) + ifnull(top5, 0)) AS points, " +
            "(ifnull(top1, 0) + ifnull(top2, 0) + ifnull(top3, 0) + ifnull(top4, 0) + ifnull(top5, 0)) - ifnull(total_falls, 0) AS total " +
            "FROM event_climber ec, climber c " +
            "WHERE ec.climber_id = c.id AND ec.event_id = ? " +
            "ORDER BY category ASC, gender DESC, total DESC;";

    // optional params: ?fmt=export|print
    server.get("data/events/:eventId/results", function(req,res,next) {
        var eventId = parseInt(req.params.eventId, 10);

        function formatDate(bd) {
            var date = new Date(bd);
            return (date.getMonth() + 1) + "/" + date.getDate() + "/" + date.getFullYear();
        }

        console.log("xxx get event results: event id: " + eventId);
        if (isNaN(eventId)) {
            console.log("xxx bad number");
            res.send(404, "Not Found");
            return next();
        }
        dbPool.getConnection(function(err, conn) {
            var query;
            if (err) {
                return next(err);
            }
            query = conn.query(eventResultSQL, [eventId], function(err, rows) {
                var i, climber, row, br, place, csvWriter,
                    report = [],
                    lastBreak = null;

                conn.release();
                if (err) {
                    return next(err);
                }

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
                        "Number", // should this be included xxx?
                        "Member Num",
                        "First Name",
                        "Last Name",
                        "Date of Birth",
                        "Gender",
                        "Category",
                        "Region",
                        "Team",
                        "Points",
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
                            place = 1;
                            lastBreak = br;
                        }
                        csvWriter.write([
                            row.number,
                            row.usac_member_id || "",
                            row.first_name,
                            row.last_name,
                            row.birth_date ? formatDate(row.birth_date) : "",
                            row.gender,
                            row.category,
                            row.region,
                            row.team || "",
                            row.points|| "",
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
                        if (row.total > 0) {
                            place += 1;
                        }
                    }
                    csvWriter.end();
                } else if ( req.params.fmt === "print" ) {
                    console.log("xxx format for print");
                    res.send("tbd");
                } else {
                    for (i = 0; i < rows.length; i++) {
                        row = rows[i];

                        br = row.gender + row.category;
                        if (br !== lastBreak) {
                            place = 1;
                            lastBreak = br;
                        }
                        climber = {
                            climberId: row.number,
                            usacMemberId: row.usac_member_id || "",
                            firstName: row.first_name,
                            lastName: row.last_name,
                            gender: row.gender,
                            category: row.category,
                            region: row.region,
                            team: row.team || "",
                            total: row.total > 0 ? row.total : '-',
                            place: '-',
                            top1: row.top1 || "-",
                            top2: row.top2 || "-",
                            top3: row.top3 || "-",
                            top4: row.top4 || "-",
                            top5: row.top5 || "-",
                            totalFalls: row.total_falls || "-"
                        };

                        if (row.total > 0) {
                            climber.place = place;
                            place += 1;
                        }

                        report.push(climber);
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
