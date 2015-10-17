/*global jQuery, logger, app, appModel, util*/
/*
 scorecard.js
 Scorecard page

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
 * On a small screen when the text input doesn't fit next to keypad put it above the keypad
 * When number of falls is > 10 and extra radio buttons are hidden give some kind of indication there there are falls
 * *Make scorecard heading fit on small screens
 * better keyboard support on scorecard
 */

(function(app, model, $, logger, util, undefined) {
    "use strict";

    var module = "ScoreCard",
        duringInitCard = false;

    // options:
    //  includeFalls
    //  includeLocation
    //  includeColor
    function renderScoreCard($sc, options) {
        var i, row, topId, fallsId,
            curCol = 0,
            table = "",
            header = "",
            routes = model.currentEvent.routes; // Expect routes in the correct order

        function setColumnTableHeader(col, header) {
            $sc.find(".scoreCardC" + col).children("thead").html(header);
        }

        function setColumnTableRows(col, rows) {
            $sc.find(".scoreCardC" + col).children("tbody").html(rows);
        }

        header += "<tr class='ui-bar-d'><th>Rt #</th>"; // xxx want Route # or Rt # depending on screen size
        if (options.includeLocation && options.showLocation) { // xxx showLocation not yet implemented
            header += "<th data-priority='2'>Location</th>"; // xxx customize location label I have seen location, Rope #
        }
        if (options.includeColor) {
            header += "<th data-priority='1'>Color</th>";
        }
        header += "<th>Points</th>";
        if (options.includeFalls) {
            header += "<th>Falls</th>";
        }
        header += "<th>Topped</th><th data-priority='2'>Rt #</th></tr>";

        setColumnTableHeader(0, header);
        setColumnTableHeader(1, header);

        if (!routes) {
            setColumnTableRows(0, "");
            setColumnTableRows(1, "");
            return;
        }

        for (i = 0; i < routes.length; i++) {
            row = routes[i];
            if (row.sheetColumn != curCol) {
                setColumnTableRows(curCol, table);
                curCol = row.sheetColumn;
                table = "";
            }
            topId = "scTop_" + row.sheetRow + "_" + row.sheetColumn;
            fallsId= "scFalls_" + row.sheetRow + "_" + row.sheetColumn;
            table += "<tr><td class='num'>" + row.number + "</td>";
            if (options.includeLocation && options.showLocation) { // xxx showLocation not yet implemented
                table += "<td>" + row.location + "</td>";
            }
            if (options.includeColor) {
                table += "<td>" + row.color + "</td>";
            }
            table += "<td class='num'>" + row.points + "</td>";
            if (options.includeFalls) {
                table += "<td><select id='" + fallsId + "'data-mini='true'><option value='0' selected>&nbsp;</option><option value='1'>1</option><option value='2'>2</option><option value='3'>3</option><option value='4'>4</option>" +
                "<option value='5'>5</option><option value='6'>6</option><option value='7'>7</option><option value='8'>8</option><option value='9'>9</option></select></td>";
            }
            table += "<td class='num'><input data-role='flipswitch' data-mini='true' id='" +
                        topId + "' data-on-text='Yes' data-off-text='No' data-wrapper-class='sc-flipswitch' type='checkbox'></td><td class='num'>" + row.number + "</td></tr>";
        }
        setColumnTableRows(curCol, table);
    }

    function findClimbForRoute(climber, routeNumber) {
        var i, curClimb,
            climb = null;

        if (climber.scoreCard && climber.scoreCard.climbs) {
            for (i = 0; i < climber.scoreCard.climbs.length; i++) {
                curClimb = climber.scoreCard.climbs[i];
                if (curClimb.number === routeNumber) {
                    climb = curClimb;
                    break;
                }
            }
        }
        return climb;
    }

    function initCurrentClimber($sc, fallsPerClimb) {
        var i, route, topId, fallsId, climb, falls,
            routes = model.currentEvent.routes,
            climber = model.currentClimber;

        $("#scClimberSelector").find(".ui-collapsible-heading-toggle").html(
            "<span id='scNumber' title='Bib Number'>#" + util.escapeHTML(climber.bibNumber) + "</span><span id='scName' title='Name'>" +
                util.escapeHTML(climber.firstName) + " " + util.escapeHTML(climber.lastName) + "</span><span id='scUsaClimbingNumber' title='USA Climbing Number'>" +
                util.escapeHTML(climber.usacMemberId || "") + "</span><span id='scGenderAndCategory'>" +
                util.escapeHTML(climber.gender + " " + climber.category) + "</span><span id='scScore'></span><span id='scAction'>Next</span>"
        );

        duringInitCard = true;
        // show scorecard and clear out card and include climber climb info
        $sc.show().find(".topN").removeClass("topN");
        if (!fallsPerClimb) {
            falls = 0;
            if (climber.scoreCard) {
                falls = climber.scoreCard.totalFalls || 0;
            }
            $("#scTF-" + falls).prop("checked", true);
            $("[name=scTF]").checkboxradio( "refresh" );
        }
        for (i = 0; i < routes.length; i++) {
            route = routes[i];

            climb = findClimbForRoute(climber, route.number);
            topId = "#scTop_" + route.sheetRow + "_" + route.sheetColumn;
            $(topId).prop("checked", climb ? climb.topped : false).flipswitch("refresh");
            if (fallsPerClimb) {
                fallsId= "#scFalls_" + route.sheetRow + "_" + route.sheetColumn;
                falls = 0;
                if (climb && climb.falls) {
                    falls = climb.falls;
                }
                $(fallsId).val(falls).selectmenu("refresh");
            }
        }
        duringInitCard = false;
        updateCard($sc, fallsPerClimb, true);

    }

    function updateCard($sc, fallsPerClimb, noUpdate) {
        var i, route, topId, fallsId, topped, falls, climb, totalPoints, totalFalls, count,
            topPoints = [],
            climbs = [],
            routes = model.currentEvent.routes,
            top_n = model.currentEvent.rounds[model.currentEvent.currentRound - 1].numRoutes;

        for (i = 0; i < routes.length; i++) {
            route = routes[i];

            topId = "#scTop_" + route.sheetRow + "_" + route.sheetColumn;
            fallsId= "#scFalls_" + route.sheetRow + "_" + route.sheetColumn;
            topped = $(topId)[0].checked;
            falls = "";
            if (fallsPerClimb) {
                falls = $(fallsId).val();
                falls = parseInt(falls, 10);
            }
            if ( falls > 0 || topped ) {
                climbs.push({
                    number: route.number,
                    topId: topId,
                    topped: topped,
                    falls: falls,
                    points: topped ? route.points : 0
                });
            }
        }
        climbs.sort(function(a,b) {
            return b.points - a.points; // order highest to lowest
        });

        totalPoints = 0;
        totalFalls = 0;
        count = 0;
        $sc.find(".topN").removeClass("topN");
        $("#scScore").removeClass("u-ok");
        for (i = 0; i < climbs.length && i < top_n; i++) {
            climb = climbs[i];
            if (climb.points > 0) {
                topPoints[count] = climb.points;
                count += 1;
                totalPoints += climb.points;
                $(climb.topId).closest("tr").addClass("topN");
                if (fallsPerClimb) {
                    totalFalls += climb.falls;
                }
            }
        }
        if (!fallsPerClimb) {
            totalFalls = $("[name=scTF]:checked").val();
            totalFalls = parseInt(totalFalls, 10);
        }

        if (!noUpdate) {
            logger.debug(module, "Update score for " + model.currentClimber.bibNumber);
            model.updateCurrentClimberScoreCard({
                totalPoints: totalPoints,
                totalFalls: totalFalls,
                top1: topPoints[0],
                top2: topPoints[1],
                top3: topPoints[2],
                top4: topPoints[3],
                top5: topPoints[4],
                climbs: climbs
            });
        }

        $("#scScore").text("Total: " + totalPoints);
        if (count >= top_n) {
            $("#scScore").addClass("u-ok");
        }

    }

    function saveScoreCard(callback) {
        model.saveCurrentClimberScoreCard()
            .done(function() {
                app.updateFooter();
                callback(true);
            })
            .fail(function(status, message) {
                app.showErrorMessage(status, "Failed to save scorecard", message);
                callback(false);
            });
    }

    function openClimberSelector() {
        if (!$("#scClimberSelector").find(".ui-collapsible-content").is(":visible")) {
            $("#scClimberSelector").find(".ui-collapsible-heading-toggle").trigger("click");
        }
    }

    function closeClimberSelector() {
        if ($("#scClimberSelector").find(".ui-collapsible-content").is(":visible")) {
            $("#scClimberSelector").find(".ui-collapsible-heading-toggle").trigger("click");
        }
    }

    app.addPage({
        name: "scorecard",
        init: function() {
            var $sc = $("#scorecard .ScoreCardCtrl"),
                $scKeypadDisplay = $("#scKeypadDisplay");

            logger.debug(module, "Init page");

            // init scorecard behavior
            $sc.on("change", function(event) {
                if (!duringInitCard) {
                    updateCard($sc, model.currentEvent.recordFallsPerClimb);
                }
            });

            // there are two save points on this page: Home button and Climber Selector collapsible
            // wait until collapsible widget is created
            $("#scClimberSelector").on("collapsiblecreate", function() {
                // then add handler for saving
                $(this).find(".ui-collapsible-heading-toggle").click(function(event){
                    // if the card is dirty and it is being expanded (Next)
                    if ($(this).parent().parent().hasClass("ui-collapsible-collapsed") && model.scoreCardDirty) {
                        // stop the normal click handling and save first
                        event.preventDefault();
                        event.stopImmediatePropagation();
                        $("#scClimberSelector").collapsible("disable");
                        saveScoreCard(function(success) {
                            $("#scClimberSelector").collapsible("enable");
                            if (success) {
                                openClimberSelector();
                            }
                        });
                    }
                });
            });

            $("#scHomeBtn").click(function(event){
                // if the card is dirty and it is being expanded (Next)
                if (model.scoreCardDirty) {
                    // stop the normal click handling and save first
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    saveScoreCard(function(success) {
                        $.mobile.changePage("#home");
                    });
                }
            });

            //
            // Select a climber
            //
            $("#scClimberSelector").on("collapsibleexpand", function() {
                $("#scAction").text("Lookup Climber");
                keypadClear();
                $("#scClimberName").val("").change();
                // exactly one will be visible
                $("#scKeypadDisplay, #scClimberName").filter(":visible")[0].focus();
            });
            $("#scClimberSelector").on("collapsiblecollapse", function() {
                if (model.currentClimber) {
                    $("#scAction").text("Next");
                }
            });

            //
            // find a climber by number
            //
            var messageShowing = false;

            function clearMessage() {
                if (messageShowing) {
                    messageShowing = false;
                    $("#scNoClimberMsg").hide();
                }
            }
            function keypadAppend(digit) {
                $scKeypadDisplay.append("<span class='key'>" + digit + "</span>");
                clearMessage();
            }
            function keypadClear() {
                $scKeypadDisplay.empty();
                clearMessage();
            }
            function keypadDelete() {
                $scKeypadDisplay.children().last().remove();
                clearMessage();
            }

            function keypadCheckBibNumber(text) {
                var bibNumber;
                if (text.length === model.currentEvent.bibNumberDigits) {
                    bibNumber = parseInt(text, 10);
                    if ( isNaN(bibNumber) || !model.setCurrentClimber(bibNumber)) {
                        keypadClear();
                        messageShowing = true;
                        $("#scBadNum").text(text);
                        $("#scNoClimberMsg").show();
                    } else {
                        setTimeout(function() {
                            initCurrentClimber($sc, model.currentEvent.recordFallsPerClimb);
                            closeClimberSelector();
                        }, 400);
                    }
                }
            }

            $("#scKeypad").on("mousedown", "button", function() {
                var value = $(this).attr("data-value");

                if ( value === "b" ) {
                    keypadDelete();
                } else if ( value === "c" ) {
                    keypadClear();
                } else {
                    keypadAppend(value);
                    keypadCheckBibNumber($("#scKeypadDisplay").text());
                }
            });
            $scKeypadDisplay.on("keypress", function(event) {
                var digit;

                if (event.which === 0 || event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) {
                    return;
                }
                digit = String.fromCharCode(event.which);
                if ( digit >= "0" && digit <= "9" ) {
                    keypadAppend(digit);
                    keypadCheckBibNumber($("#scKeypadDisplay").text());
                }
            }).on("keydown", function(event) {
                    if (event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) {
                        return;
                    }
                    if (event.which === $.ui.keyCode.BACKSPACE) {
                        keypadDelete();
                    } else if (event.which === $.ui.keyCode.DELETE) {
                        keypadClear();
                    }
                });

            //
            // find a climber by name
            //
            $("#scClimbersList").on("filterablebeforefilter", function(e, data) {
                var i, climbers, climber, display, filter,
                    $ul = $(this),
                    $input = $(data.input),
                    value = $input.val(),
                    html = "";

                $ul.html("");
                if (value) {
                    climbers = model.findClimbers(value);
                    for (i = 0; i < climbers.length; i++) {
                        climber = climbers[i];
                        display = climber.firstName + " " + climber.lastName;
                        filter = climber.usacMemberId + " " +climber.team + " " + display;
                        html += "<li data-filtertext='" + filter + "'><a data-value='" + climber.bibNumber + "' href='#'>" + display + "</a></li>";
                    }
                    $ul.html(html);
                    $ul.listview("refresh");
                    $ul.trigger("updatelayout");
                }
            }).on("click", "a", function() {
                var bibNumber = $(this).attr("data-value");
                if (bibNumber) {
                    model.setCurrentClimber(bibNumber);
                    initCurrentClimber($sc, model.currentEvent.recordFallsPerClimb);
                    closeClimberSelector();
                }
            });

            $("#scMoreFalls").click(function(event) {
                var visible = $("#scFallsExtra").is(":visible");
                if (visible) {
                    $("#scFallsExtra").hide();
                    $("#scMoreFalls").text("More");
                } else {
                    $("#scFallsExtra").show();
                    $("#scMoreFalls").text("Less");
                }
            });
        },
        open: function() {
            var $sc = $("#scorecard .ScoreCardCtrl");
            app.clearMessage();

            if (!model.currentEvent) {
                $("body").pagecontainer("change", $("#home"));
                return;
            }
            logger.debug(module, "Page is now active");

            if (!model.currentClimber) {
                openClimberSelector();
                $("#scClimberSelector").find(".ui-collapsible-heading-toggle").html("<span id='scAction'>Lookup Climber</span>");
            }
        }
    });

    //xxx when is this used???
    app.initScoreCard = function() {
        var event = model.currentEvent,
            $sc = $("#scorecard .ScoreCardCtrl");

        logger.debug(module, "Init scorecard");

        renderScoreCard($sc, {
            includeFalls: event.recordFallsPerClimb,
            includeColor: event.routesHaveColor,
            includeLocation: event.routesHaveLocation
        });
        $sc.find(".scTable").each(function() {
            var $t = $(this);
            $t.find(":checkbox").flipswitch();
            $t.find("select").selectmenu();
            $t.table();
            $t.table("rebuild");
        });

        $sc.hide();
        $("#scTotalFalls").toggle(!event.recordFallsPerClimb);
    };

})(app, appModel, jQuery, logger, util);
