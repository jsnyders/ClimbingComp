/*
 main.js
 web app main page

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
/*global alert, jQuery, logger, appModel, util*/
/*jshint browser: true, strict: true */

/*
 * xxx todo
 * progress spinner see: "loader"
 */

var app = {};

(function(app, model, $, logger, undefined) {
    "use strict";

    // xxx during development
    logger.setLevel(logger.LEVEL_DEBUG);
    logger.setFacility("*", true);

    var curEventId = "",
        pagesMap = {};

    app.showMessage = function(title, message) {
        $.mobile.activePage.find(".messageArea").find(".messageContent").html(message)
            .end().find(".messageHeader").text(title)
            .end().show();
    };

    app.clearMessage = function(page) {
        var $page = (typeof page === "string" ? $("#" + page) : page) || $.mobile.activePage;
        if ($page) {
            $page.find(".messageArea").find(".messageContent").empty()
                .end().find(".messageHeader").text("")
                .end().hide();
        }
    };

    app.showErrorMessage = function(status, summary, message) {
        // xxx improve this
        app.showMessage("Error", summary + "<br>" + message + "<br>" + status);
    };

    $(document.body).on("click", ".messageCloseButton", function() {
        $(this).closest(".messageArea").hide();
    });


    app.addPage = function(p) {
        pagesMap[p.name] = p;
    };

    //
    // Home page
    //
    function fetchCurrentEvent(eventId) {
        $("#hScoreCardLink, #hResultsLink").toggleClass("ui-state-disabled", true);

        if (!eventId) {
            curEventId = "";
            model.clearCurrentEvent();
            app.updateFooter();
            return;
        } // else

        model.fetchCurrentEventData(eventId)
            .done(function() {
                curEventId = model.currentEvent.eventId;
                app.updateFooter();
                app.initScoreCard(); //xxx
                $("#hScoreCardLink").toggleClass("ui-state-disabled", eventId === "" || !model.accessCheck(model.auth.ROLE_CONTRIBUTOR));
                $("#hResultsLink").toggleClass("ui-state-disabled", eventId === "");
            })
            .fail(function() {
                curEventId = "";
                alert("Failed to get event data"); // xxx reason, message area
                app.updateFooter();
                $("#hScoreCardLink, #hResultsLink").toggleClass("ui-state-disabled", eventId === "");
            });
    }

    function renderEventsOptions() {
        var count = model.events.length;

        function eventLabel(event) {
            return util.escapeHTML(event.location) + " " + util.formatDate(event.date);
        }

        $("#hEventActions,#hNoEvents,#hOneEvent,#hManyEvents").hide();

        if (count === 0) {
            $("#hNoEvents").show();
            curEventId = "";
            model.clearCurrentEvent();
            app.updateFooter();
        } else if (count === 1) {
            $("#hOneEvent,#hEventActions").show();
            $("#hEvent1").text(eventLabel(model.events[0]));
            fetchCurrentEvent(model.events[0].eventId);
        } else { // more than one
            $("#hManyEvents,#hEventActions").show();
            util.renderOptions($("#hEvent"), model.events, {
                value:"eventId",
                label: eventLabel,
                nullValue: "",
                nullLabel: "Choose Climbing Event",
                selectedValue: "" + curEventId
            });
        }
    }

    app.addPage({
        name:"home",
        init: function() {
            logger.debug("Home", "Init page");

            $("#hLogOutBtn").on("click", function() {
                model.clearCurrentEvent();
                curEventId = "";
                model.logOut()
                    .always(function() {
                        // going to the same page will run prepare which adjusts the page content based on new state
                        $.mobile.changePage("#home");
                    });
            });

            $("#hEvent").on("change", function() {
                var eventId = $(this).val();

                if (eventId !== "" + curEventId) {
                    fetchCurrentEvent(eventId);
                }
            });
        },
        prepare: function() {
            $("#hLogInLink").toggle(!model.isLoggedIn());
            $("#hLogOutBtn").toggle(model.isLoggedIn());
            app.clearMessage();

            $("#hAdminSection,#hCurrentEventSection").hide();

            app.updateFooter();

            if (model.isLoggedIn()) {
                if (model.accessCheck(model.auth.ROLE_ADMIN)) {
                    $("#hAdminSection").show();
                }
                $("#hCurrentEventSection").show();

                model.fetchEvents("running").done(function() {
                    renderEventsOptions();
                });
            }
        },
        open: function(ui) {
            logger.debug("Home", "Page is now active");
        }
    });

    app.updateFooter = function() {
        var status;
        if (model.isLoggedIn()) {
            $(".fUser").html("<span class='ui-icon ui-icon-user'></span>" + util.escapeHTML(model.getUsername()));
        } else {
            $(".fUser").html("");
        }
        if (model.currentEvent) {
            status = model.getPercentComplete();
            status = isNaN(status) ? "" : status + "%";
            $(".fCurEvent").html(
                util.escapeHTML(model.currentEvent.location) + " " + util.formatDate(model.currentEvent.date) +
                "<span class='fStatus'>" + util.escapeHTML(status) + "</span>");
        } else {
            $(".fCurEvent").html("");
        }
    };

    //
    // Login page
    //
    app.addPage({
        name:"login",
        init: function() {
            logger.debug("LogIn", "Init page");

            function doLogIn() {
                var username = $("#lUsername").val().trim(),
                    password = $("#lPassword").val().trim();

                // validate username and password are required
                if (!username) {
                    alert("Username is required");
                    return;
                }
                if (!password) {
                    alert("Password is required");
                    return;
                }
                model.logIn(username, password)
                    .done(function() {
                        logger.debug("Login successful");
                        $.mobile.changePage("#home");
                    }).fail(function(status, message) {
                        $("#lMessage").show().text(message);
                    });
                $("#lPassword").val(""); // clear password
            }

            $("#lLogIn").on("click", function() {
                doLogIn();
            });

            $("#lPassword").on("keydown", function(event) {
                if (event.which === 13) {
                    doLogIn();
                }
            });

        },
        prepare: function() {
            $("#lMessage").hide().empty();
        },
        close: function() {
            logger.debug("LogIn", "Close page");
            $("#lPassword").val(""); // clear password
        }
    });

    //
    // global initialization
    //
    $.mobile.document
        .on("pagecontainercreate", function( event ) {
            var key, p;

            // init footer by copying from home page to all the others
            var footer$ = $("#home").find(".footer");
            $("[data-role=page]").not("[data-dialog]").append(footer$);

            // init all the pages
            for (key in pagesMap) {
                if (pagesMap.hasOwnProperty(key)) {
                    p = pagesMap[key];
                    if (p.init) {
                        p.init();
                    }
                }
            }

        })
        .on("pagecontainerbeforechange", function(event, ui) {
            var p, ndx, args, parsed,
                pageId = ui.toPage[0].id;

            if (pageId) {
                parsed = $.mobile.path.parseUrl( ui.absUrl );
                ndx = parsed.hash.indexOf("?");
                if (ndx >= 0) {
                    args = parsed.hash.substr(ndx + 1);
                    ui.args = args.split(":");
                    ui.toPage.jqmData( "url", parsed.hash );
                }

                p = pagesMap[pageId];
                if (p && p.prepare) {
                    p.prepare(ui);
                }
            }
        })
        .on("pagecontainerbeforetransition", function(event, ui) {
/*
not sure why example here http://demos.jquerymobile.com/1.4.4/navigation-hash-processing/
shows parsing the url and setting the url data on the target page here seems to work fine from beforechange.
            var ndx, args,
                parsed = $.mobile.path.parseUrl( ui.absUrl );

            ndx = parsed.hash.indexOf("?");
            if (ndx >= 0) {
                args = parsed.hash.substr(ndx + 1);
                ui.args = args.split(":");
            }
            console.log("xxx before change", ui.args);
            console.log("xxx parsed hash ", parsed); */
        })
        .on("pagecontainerchange", function(event, ui) {
            var p,
                pageId = ui.toPage[0].id,
                fromPageId = ui.prevPage && ui.prevPage[0].id;

            p = pagesMap[fromPageId];
            if (p && p.close) {
                p.close(ui);
            }
            p = pagesMap[pageId];
            if (p && p.open) {
                p.open(ui);
            }
        });

    // fix current tab display
    $(document.body).on("tabsactivate", function(event, ui) {
        $(event.target).children(".ui-navbar").find(".ui-btn").removeClass("ui-btn-active");
        ui.newTab.find(".ui-btn").addClass("ui-btn-active");
    });

    $(document)
        .ajaxError(function(event, jqxhr, settings, thrownError) {
            if (jqxhr.status === 401) {
                console.log("xxx unauthenticated" + jqxhr.responseJSON.code);
                if ($.mobile.activePage[0].id === "login") {
                    return;
                }
                if (jqxhr.responseJSON && jqxhr.responseJSON.code === "SessionExpired") {
                    alert("Your session has expired or timed out.\nYou need to sign in again.");
                }
                $(document.body).pagecontainer("change", "#home");
            } else if (jqxhr.status === 403) {
                console.log("xxx unauthorized" + jqxhr.responseJSON.code);
                $(document.body).pagecontainer("change", "#home");
            }
        });

})(app, appModel, jQuery, logger);
