/*
 * Copyright (c) 2014, John Snyders
 *
 * xxx todo
 * Events should have a state: open (add/edit routes, climbers), active (fill out score cards), closed (results final) Set on admin page
 * Fill in footer or remove
 * progress spinner see: "loader"
 */
/*global alert, jQuery, logger, appModel, util*/
/*jshint browser: true, strict: true */

var app = {};

(function(app, model, $, logger, undefined) {
    "use strict";

    // xxx during development
    logger.setLevel(logger.LEVEL_DEBUG);
    logger.setFacility("*", true);

    var curEventId = null,
        pagesMap = {};

    app.addPage = function(p) {
        pagesMap[p.name] = p;
    };

    //
    // Home page
    //
    function renderEventsOptions() {
        // xxx should there be a make a choice option? Should the event matching the current date be selected by default
        // is the default set some other way
        util.renderOptions($("#hEvent"), model.events, {
            value:"eventId",
            label: function(event) {
                return event.location + " " + util.formatDate(event.date);
            }});
    }

    app.addPage({
        name:"home",
        init: function() {
            logger.debug("Home", "Init page");

            $("#hLogOutBtn").on("click", function() {
                model.logOut()
                    .always(function() {
                        // going to the same page will run prepare which adjusts the page content based on new state
                        $.mobile.changePage("#home");
                    });
            });

            $("#hEvent").on("change", function() {
                var eventId = $(this).val();

                app.updateFooter();
                if (eventId !== curEventId) {
                    model.fetchCurrentEventData(eventId)
                        .done(function() {
                            curEventId = model.currentEvent.eventId;
                            app.updateFooter();
                            app.initScoreCard(); //xxx
                            $("#hScoreCardLink, #hResultsLink").toggleClass("ui-state-disabled", eventId === "");
                        })
                        .fail(function() {
                            curEventId = null;
                            alert("Failed to get event data"); // xxx reason, message area
                            $("#hScoreCardLink, #hResultsLink").toggleClass("ui-state-disabled", eventId === "");
                        });
                }
            });
        },
        prepare: function() {
            $("#hLogInLink").toggle(!model.isLoggedIn());
            $("#hLogOutBtn").toggle(model.isLoggedIn());

            $("#hAdminSection,#hCurrentEventSection").hide();

            if (model.isLoggedIn()) {
                if (model.accessCheck(model.auth.ROLE_ADMIN)) {
                    $("#hAdminSection").show();
                }
                $("#hCurrentEventSection").show();

                model.fetchEvents().done(function() {
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
        if (model.currentEvent) {
            status = model.getPercentComplete() + "%";
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

            $("#lLogIn").on("click", function() {
                var username = $("#lUsername").val().trim(),
                    password = $("#lPassword").val().trim();

                // validate username and password are required
                if (!username) {
                    alert("username is required");
                    return;
                }
                if (!password) {
                    alert("password is required");
                    return;
                }
                model.logIn(username, password)
                    .done(function() {
                        logger.debug("Login successful");
                        $.mobile.changePage("#home");
                    }).fail(function(message) {
                        $("#lMessage").show().text(message || "Invalid credentials.");
                    });
                $("#lPassword").val(""); // clear password
            });

            $("#lCancel").on("click", function() {
                $("#lUsername").val(""); // clear username
                $("#lPassword").val(""); // clear password
                $.mobile.changePage("#home");
            });

        },
        prepare: function() {
            $("#lMessage").hide().empty();
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
                pageId = ui.toPage[0].id;

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
