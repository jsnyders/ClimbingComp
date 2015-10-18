/*
 * appModel.js
 * Data model layer for Climbing Comp web app.
 * Copyright (c) 2014, 2015 John Snyders
 */
/*global jQuery, logger, util, appModel:true */

/*
 * xxx todo
 */
var appModel = (function($, logger, util, undefined) {
    "use strict";

    var module = "Model";

    var gAccessToken = null,
        gUsername = "",
        gRole = "";

    function setAuthInfo(token, username, role) {
        gAccessToken = token;
        gUsername = username;
        gRole = role;
        util.setSessionProperty("accessToken", gAccessToken);
        util.setSessionProperty("authUsername", gUsername);
        util.setSessionProperty("authRole", gRole);
    }

    function clearAuthInfo() {
        gAccessToken = null;
        gUsername = "";
        gRole = "";
        util.setSessionProperty("accessToken", gAccessToken);
        util.setSessionProperty("authUsername", gUsername);
        util.setSessionProperty("authRole", gRole);
    }

    var ROLE_LEVEL = {
        Admin: 3,
        Contributor: 2,
        Reader: 1
    };

    // keep in sync with auRole select list on adminUser page
    var ROLE_DISPLAY = {
        Admin: "Administrator",
        Contributor: "Scorecard Entry",
        Reader: "Read Only Access"
    };

    function getRoleLevel(role) {
        return ROLE_LEVEL[role] || -1;
    }

    gAccessToken = util.getSessionProperty("accessToken") || null;
    gUsername = util.getSessionProperty("authUsername") || null;
    gRole = util.getSessionProperty("authRole") || null;

    $(document).ajaxSend(function(event, jqxhr, settings) {
        if (gAccessToken) {
            jqxhr.setRequestHeader("AccessToken", gAccessToken);
        }
    }).ajaxError(function(event, jqxhr, settings, thrownError) {
        if (jqxhr.status === 401) {
            logger.debug("Received 401 unauthenticated status; clear access token");
            clearAuthInfo();
        }
    });

    function getStatus(jqXHR) {
        return jqXHR.status + " " + jqXHR.statusText;
    }

    function getMessage(jqXHR) {
        if (jqXHR.responseJSON) {
            return jqXHR.responseJSON.message || jqXHR.responseJSON.code || "Unknown Error";
        } // else
        return jqXHR.responseText || "";
    }

    return {
        events: [ ],
        currentEvent: null,
        currentClimber: null,
        scoreCardDirty: false,
        auth: {
            ROLE_ADMIN: "Admin",
            ROLE_READER: "Reader",
            ROLE_CONTRIBUTOR: "Contributor"
        },

        // logIn
        // POST /data/sessions
        logIn: function(username, password) {
            var result = $.Deferred(),
                self = this;

            logger.debug(module, "Login");
            $.ajax({
                type: "POST",
                url: "data/sessions",
                contentType: "application/json",
                data: JSON.stringify({
                    username: username,
                    password: password
                }),
                dataType: "json"
            }).done(function(data) {
                setAuthInfo(data.access_token, data.username, data.role);
                result.resolve();
            }).fail(function(jqXHR) {
                logger.error(module, "Login failed: " + getMessage(jqXHR));
                result.reject(getStatus(jqXHR),jqXHR.responseJSON.message || "Invalid credentials.");
            });
            return result.promise();
        },

        isLoggedIn: function() {
            return gAccessToken !== null;
        },

        getUsername: function() {
            return gUsername;
        },

        getDisplayRole: function(role) {
            return ROLE_DISPLAY[role] || "unknown";
        },

        accessCheck: function(role) {
            var aRoleLevel, roleLevel;
            if (gRole !== "") {
                aRoleLevel = getRoleLevel(gRole);
                roleLevel = getRoleLevel(role);
                if (aRoleLevel > 0 && roleLevel > 0 && aRoleLevel >= roleLevel ) {
                    return true;
                }
            }
            return false;
        },

        // logOut
        // DELETE data/sessions/current
        logOut: function() {
            var result = $.Deferred(),
                self = this;

            logger.debug(module, "Logout");
            $.ajax({
                type: "DELETE",
                url: "data/sessions/current",
                dataType: null
            }).done(function() {
                result.resolve();
            }).fail(function(jqXHR) {
                logger.error(module, "Logout failed: " + getMessage(jqXHR));
                result.reject(getStatus(jqXHR), getMessage(jqXHR));
            });
            clearAuthInfo();
            return result.promise();
        },

        // =====================================
        // Climbers
        // =====================================

        fetchCategories: function() {
            var result = $.Deferred();

            logger.debug(module, "Fetch categories");
            $.ajax({
                url: "/data/nvp/CATEGORIES",
                dataType: "json"
            }).done(function(data) {
                var i,
                    list = [];
                // in this case we know the label and the value are the same
                for (i = 0; i < data.items.length; i++) {
                    list.push(data.items[i].value);
                }
                result.resolve(list);
            }).fail(function(jqXHR) {
                logger.error(module, "Fetch categories failed: " + getMessage(jqXHR));
                result.reject(getStatus(jqXHR), getMessage(jqXHR));
            });
            return result.promise();
        },

        fetchGenders: function() {
            var result = $.Deferred();

            logger.debug(module, "Fetch genders");
            setTimeout( function() {
                result.resolve([
                    "Male",
                    "Female"
                ]);
            },10);
            return result.promise();
        },

        fetchGenderCategoriesFilters: function() {
            var result = $.Deferred();

            // xxx todo how to get the initial default
            logger.debug(module, "Fetch gender categories filters");
            $.ajax({
                url: "/data/nvp/CATEGORIES",
                dataType: "json"
            }).done(function(data) {
                var i, item, value,
                    list = [];
                // in this case we know the label and the value are the same
                for (i = 0; i < data.items.length; i++) {
                    item = data.items[i];
                    value = item.value;
                    list.push({
                        value: "gender:eq:Female,category:eq:" + value,
                        label: "Female " + value
                    });
                    list.push({
                        value: "gender:eq:Male,category:eq:" + value,
                        label: "Male " + value
                    });
                }
                result.resolve(list);
            }).fail(function(jqXHR) {
                logger.error(module, "Fetch gender category filters failed: " + getMessage(jqXHR));
                result.reject(getStatus(jqXHR), getMessage(jqXHR));
            });
            return result.promise();
        },

        //
        // GET /data/climbers
        // xxx more options like search, columns, paging
        fetchClimbers: function(filters, orderBy) {
            var i, url,
                params = "",
                result = $.Deferred();

            logger.debug(module, "Fetch climbers");
            url = "/data/climbers";
            // xxx make a function for this
            if (filters) {
                for (i = 0; i < filters.length; i++) {
                    if (params) {
                        params += "&";
                    }
                    params += "f=" + filters[i];
                }
            }
            if (orderBy) {
                for (i = 0; i < orderBy.length; i++) {
                    if (params) {
                        params += "&";
                    }
                    params += "o=" + orderBy[i];
                }
            }

            if (params) {
                url += "?" + params;
            }
            $.ajax({
                url: url,
                dataType: "json"
            }).done(function(data) {
                var i,
                    offset = data.offset || 0,
                    total = data.total || data.items.length;

                data = data.items;
                for (i = 0; i < data.length; i++) {
                    if (data[i].birthDate) {
                        data[i].birthDate = new Date(data[i].birthDate);
                    }
                    if (data[i].updatedOn) {
                        data[i].updatedOn = new Date(data[i].updatedOn);
                    }
                }
                result.resolve(data, offset, total);
            }).fail(function(jqXHR) {
                logger.error(module, "Fetch climbers failed: " + getMessage(jqXHR));
                result.reject(getStatus(jqXHR), getMessage(jqXHR));
            });
            return result.promise();
        },

        //
        // GET /data/climbers/<climber-id>
        //
        fetchClimber: function(climberId) {
            var result,
                self = this;

            logger.debug(module, "Fetch climber " + climberId);

            result = $.Deferred();
            $.ajax({
                url: "data/climbers/" + climberId,
                dataType: "json"
            }).done(function(data) {
                result.resolve(data);
            }).fail(function(jqXHR) {
                logger.error(module, "Fetch climber failed: " + getMessage(jqXHR));
                result.reject(getStatus(jqXHR), getMessage(jqXHR));
            });
            return result.promise();
        },

        //
        // POST /data/climbers
        //
        createClimber: function(climber) {
            var result,
                self = this;

            logger.debug(module, "Create climber " + climber.firstName + " " + climber.lastName);

            result = $.Deferred();
            $.ajax({
                type: "POST",
                url: "data/climbers",
                contentType: "application/json",
                data: JSON.stringify(climber),
                dataType: "json"
            }).done(function(data) {
                result.resolve(data);
            }).fail(function(jqXHR) {
                logger.error(module, "Create climber failed: " + getMessage(jqXHR));
                result.reject(getStatus(jqXHR), getMessage(jqXHR)); // xxx item errors
            });
            return result.promise();
        },

        //
        // PUT /data/climbers/<climber-id>
        //
        updateClimber: function(climber) {
            var result,
                climberId = climber.climberId;

            logger.debug(module, "Update climber " + climber.firstName + " " + climber.lastName);

            result = $.Deferred();
            $.ajax({
                type: "PUT",
                url: "data/climbers/" + climberId,
                contentType: "application/json",
                data: JSON.stringify(climber),
                dataType: "json"
            }).done(function(data) {
                result.resolve(data);
            }).fail(function(jqXHR) {
                logger.error(module, "Update climber failed: " + getMessage(jqXHR));
                result.reject(getStatus(jqXHR), getMessage(jqXHR)); // xxx item errors
            });
            return result.promise();
        },

        //
        // DELETE /data/climbers/<climber-id>
        //
        deleteClimber: function(climberId, version) {
            var result;

            logger.debug(module, "Delete climber " + climberId + " at version " + version);

            result = $.Deferred();
            $.ajax({
                type: "DELETE",
                url: "data/climbers/" + climberId + "?version=" + version,
                dataType: null
            }).done(function(data) {
                result.resolve();
            }).fail(function(jqXHR) {
                logger.error(module, "Delete climber failed: " + getMessage(jqXHR));
                result.reject(getStatus(jqXHR), getMessage(jqXHR));
            });
            return result.promise();
        },

        uploadClimbers: function(hasHeader, action, continueOnErrors, dateFormat, fields, file) {
            var fd,
                self = this,
                result = $.Deferred();

            logger.debug(module, "Upload climbers. File: " + file.name +", action: " + action);

            fd = new FormData();
            fd.append("file", file);
            fd.append("hasHeader", hasHeader ? "yes" : "no");
            fd.append("action", action);
            fd.append("continueOnErrors", continueOnErrors ? "yes" : "no");
            fd.append("dateFormat", dateFormat);
            fd.append("fields", fields.join(","));

            $.ajax({
                type: "POST",
                url: "data/climbers-upload",
                data: fd,
                enctype: 'multipart/form-data',
                processData: false,  // tell jQuery not to process the data
                contentType: false   // tell jQuery not to set contentType
            }).done(function(data) {
                result.resolve(data);
            }).fail(function(jqXHR) {
                logger.error(module, "Upload climbers file failed: " + getMessage(jqXHR));
                result.reject(getStatus(jqXHR), getMessage(jqXHR));
            });
            return result.promise();
        },

        // =====================================
        // Events
        // =====================================

        //
        // GET /data/events
        //
        fetchEvents: function(state) {
            var result = $.Deferred(),
                self = this,
                qparams = "";

            if (state === "all" || state === "running") {
                qparams = "?state=" + state;
            }
            logger.debug(module, "Fetch Events");
            $.ajax({
                url: "/data/events" + qparams,
                dataType: "json"
            }).done(function(data) {
                var i;

                data = data.items;
                for (i = 0; i < data.length; i++) {
                    data[i].date = new Date(data[i].date);
                }
                self.events = data;
                result.resolve();
            }).fail(function(jqXHR) {
                logger.error(module, "Fetch events failed: " + getMessage(jqXHR));
                result.reject(getStatus(jqXHR), getMessage(jqXHR));
            });
            return result.promise();
        },

        fetchRegions: function() {
            var result = $.Deferred(),
                self = this;

            logger.debug(module, "Fetch Regions");
            $.ajax({
                url: "/data/nvp/REGIONS",
                dataType: "json"
            }).done(function(data) {
                var i,
                    list = [];
                // in this case we know the label and the value are the same
                for (i = 0; i < data.items.length; i++) {
                    list.push(data.items[i].value);
                }
                result.resolve(list);
            }).fail(function(jqXHR) {
                logger.error(module, "Fetch regions failed: " + getMessage(jqXHR));
                result.reject(getStatus(jqXHR), getMessage(jqXHR));
            });
            return result.promise();
        },

        fetchRegionFilters: function() {
            var result = $.Deferred();

            logger.debug(module, "Fetch region filters");
            $.ajax({
                url: "/data/nvp/REGIONS",
                dataType: "json"
            }).done(function(data) {
                var i, item, value,
                    list = [];
                // in this case we know the label and the value are the same
                for (i = 0; i < data.items.length; i++) {
                    item = data.items[i];
                    value = item.value;
                    list.push({
                        value: "region:eq:" + value,
                        label: value
                    });
                }
                result.resolve(list);
            }).fail(function(jqXHR) {
                logger.error(module, "Fetch regions failed: " + getMessage(jqXHR));
                result.reject(getStatus(jqXHR), getMessage(jqXHR));
            });
            return result.promise();
        },

        //
        // GET /data/events/<event-id>
        //
        fetchEvent: function(eventId) {
            var result = $.Deferred();

            logger.debug(module, "Fetch Event");

            $.ajax({
                url: "data/events/" + eventId,
                dataType: "json"
            }).done(function(data) {
                data.date = new Date(data.date);
                result.resolve(data);
            }).fail(function(jqXHR) {
                logger.error(module, "Fetch event failed: " + getMessage(jqXHR));
                result.reject(getStatus(jqXHR), getMessage(jqXHR));
            });
            return result.promise();
        },

        //
        // GET /data/events/<event-id>
        //
        fetchEventDefaults: function() {
            var result = $.Deferred();

            logger.debug(module, "Fetch Event");

            $.ajax({
                url: "data/events-create-defaults",
                dataType: "json"
            }).done(function(data) {
                data.date = new Date(data.date);
                result.resolve(data);
            }).fail(function(jqXHR) {
                logger.error(module, "Fetch event defaults failed: " + getMessage(jqXHR));
                result.reject(getStatus(jqXHR), getMessage(jqXHR));
            });
            return result.promise();
        },

        clearCurrentEvent: function() {
            this.currentClimber = null;
            this.currentEvent = null;
        },

        //
        // GET /data/events/<event-id>/data
        //
        fetchCurrentEventData: function(eventId) {
            var currentEvent, result,
                self = this;

            logger.debug(module, "Fetch Event Data");
            this.currentClimber = null;
            this.currentEvent = currentEvent = {
                eventId: eventId,
                routes: null,
                climbers: null
            };

            if (eventId === "") {
                throw "Event id is required";
            }

            result = $.Deferred();
            $.ajax({
                url: "data/events/" + eventId + "/data",
                dataType: "json"
            }).done(function(data) {
                var i, climber;

                self.currentEvent = currentEvent = data;
                currentEvent.date = new Date(currentEvent.date);

                logger.info(module, "Fetch event data loaded " + currentEvent.climbers.length + " climbers, and " + currentEvent.routes.length + " routes");
                // index climbers
                currentEvent.climberIndex = {};
                for (i = 0; i < currentEvent.climbers.length; i++) {
                    climber = currentEvent.climbers[i];
                    if (climber.scoreCard && climber.scoreCard.climbs) {
                        climber.scoreCard.climbs = climber.scoreCard.climbs; // xxx this makes no sense
                    }
                    currentEvent.climberIndex[climber.bibNumber] = climber;
                }
                result.resolve();
            }).fail(function(jqXHR) {
                logger.error(module, "Fetch event data failed: " + getMessage(jqXHR));
                result.reject(getStatus(jqXHR), getMessage(jqXHR));
            });
            return result.promise();
        },

        //
        // POST /data/events
        //
        createEvent: function(event) {
            var result,
                self = this;

            logger.debug(module, "Create event " + event.location);

            result = $.Deferred();
            $.ajax({
                type: "POST",
                url: "data/events",
                contentType: "application/json",
                data: JSON.stringify(event),
                dataType: "json"
            }).done(function(data) {
                result.resolve(data);
            }).fail(function(jqXHR) {
                logger.error(module, "Create event failed: " + getMessage(jqXHR));
                result.reject(getStatus(jqXHR), getMessage(jqXHR)); // xxx item errors
            });
            return result.promise();
        },

        //
        // PUT /data/events/<event-id>
        //
        updateEvent: function(event) {
            var result,
                eventId = event.eventId,
                self = this;

            logger.debug(module, "Update event " + eventId);

            result = $.Deferred();
            $.ajax({
                type: "PUT",
                url: "data/events/" + eventId,
                contentType: "application/json",
                data: JSON.stringify(event),
                dataType: "json"
            }).done(function(data) {
                result.resolve(data);
            }).fail(function(jqXHR) {
                logger.error(module, "Update event failed: " + getMessage(jqXHR));
                result.reject(getStatus(jqXHR), getMessage(jqXHR)); // xxx item errors
            });
            return result.promise();
        },

        //
        // DELETE /data/events/<event-id>
        //
        deleteEvent: function(eventId, version) {
            var result;

            logger.debug(module, "Delete event " + eventId + " at version " + version);

            result = $.Deferred();
            $.ajax({
                type: "DELETE",
                url: "data/events/" + eventId + "?version=" + version,
                dataType: null
            }).done(function(data) {
                result.resolve();
            }).fail(function(jqXHR) {
                logger.error(module, "Delete event failed: " + getMessage(jqXHR));
                result.reject(getStatus(jqXHR), getMessage(jqXHR));
            });
            return result.promise();
        },

        // =====================================
        // Event Climbers
        // =====================================

        //
        // GET /data/events/<event-id>/climbers
        // xxx more options like search, columns, paging
        fetchEventClimbers: function(eventId, filters, orderBy) {
            var i, url,
                params = "",
                result = $.Deferred();

            logger.debug(module, "Fetch event " + eventId + " climbers");
            url = "/data/events/" + eventId + "/climbers";
            // xxx make a function for this
            if (filters) {
                for (i = 0; i < filters.length; i++) {
                    if (params) {
                        params += "&";
                    }
                    params += "f=" + filters[i];
                }
            }
            if (orderBy) {
                for (i = 0; i < orderBy.length; i++) {
                    if (params) {
                        params += "&";
                    }
                    params += "o=" + orderBy[i];
                }
            }

            if (params) {
                url += "?" + params;
            }
            $.ajax({
                url: url,
                dataType: "json"
            }).done(function(data) {
                var i,
                    offset = data.offset || 0,
                    total = data.total || data.items.length;

                data = data.items;
                for (i = 0; i < data.length; i++) {
                    if (data[i].birthDate) {
                        data[i].birthDate = new Date(data[i].birthDate);
                    }
                    if (data[i].updatedOn) {
                        data[i].updatedOn = new Date(data[i].updatedOn);
                    }
                }
                result.resolve(data, offset, total);
            }).fail(function(jqXHR) {
                logger.error(module, "Fetch event climbers failed: " + getMessage(jqXHR));
                result.reject(getStatus(jqXHR), getMessage(jqXHR));
            });
            return result.promise();
        },

        //
        // GET /data/events/<event-id>/climbers/<climber-id>
        //
        fetchEventClimber: function(eventId, climberId) {
            var result,
                self = this;

            logger.debug(module, "Fetch event " + eventId + " climber " + climberId);

            result = $.Deferred();
            $.ajax({
                url: "data/events/" + eventId + "/climbers/" + climberId,
                dataType: "json"
            }).done(function(data) {
                result.resolve(data);
            }).fail(function(jqXHR) {
                logger.error(module, "Fetch event climber failed: " + getMessage(jqXHR));
                result.reject(getStatus(jqXHR), getMessage(jqXHR));
            });
            return result.promise();
        },

        //
        // POST /data/events/<event-id>/climbers
        //
        createEventClimber: function(eventId, climber) {
            var result,
                self = this;

            logger.debug(module, "Create event " + eventId + " climber " + climber.climberId + " bibNumber " + climber.bibNumber);

            result = $.Deferred();
            $.ajax({
                type: "POST",
                url: "data/events/" + eventId + "/climbers",
                contentType: "application/json",
                data: JSON.stringify(climber),
                dataType: "json"
            }).done(function(data) {
                result.resolve(data);
            }).fail(function(jqXHR) {
                logger.error(module, "Create event climber failed: " + getMessage(jqXHR));
                result.reject(getStatus(jqXHR), getMessage(jqXHR)); // xxx item errors
            });
            return result.promise();
        },

        //
        // PUT /data/events/<event-id>/climbers/<climber-id>
        //
        updateEventClimber: function(eventId, climber) {
            var result,
                climberId = climber.climberId;

            logger.debug(module, "Update event " + eventId + " climber " + climber.firstName + " " + climber.lastName);

            result = $.Deferred();
            $.ajax({
                type: "PUT",
                url: "data/events/" + eventId + "/climbers/" + climberId,
                contentType: "application/json",
                data: JSON.stringify(climber),
                dataType: "json"
            }).done(function(data) {
                result.resolve(data);
            }).fail(function(jqXHR) {
                logger.error(module, "Update event climber failed: " + getMessage(jqXHR));
                result.reject(getStatus(jqXHR), getMessage(jqXHR)); // xxx item errors
            });
            return result.promise();
        },

        //
        // DELETE /data/events/<event-id>/climbers/<climber-id>
        //
        deleteEventClimber: function(eventId, climberId, version) {
            var result;

            logger.debug(module, "Delete event " + eventId + " climber " + climberId + " at version " + version);

            result = $.Deferred();
            $.ajax({
                type: "DELETE",
                url: "data/events/" + eventId + "/climbers/" + climberId + "?version=" + version,
                dataType: null
            }).done(function(data) {
                result.resolve();
            }).fail(function(jqXHR) {
                logger.error(module, "Delete event climber failed: " + getMessage(jqXHR));
                result.reject(getStatus(jqXHR), getMessage(jqXHR));
            });
            return result.promise();
        },

        uploadEventClimbers: function(eventId, hasHeader, action, continueOnErrors, dateFormat, fields, file) {
            var fd,
                self = this,
                result = $.Deferred();

            logger.debug(module, "Upload event " + eventId + " climbers. File: " + file.name +", action: " + action);

            fd = new FormData();
            fd.append("file", file);
            fd.append("hasHeader", hasHeader ? "yes" : "no");
            fd.append("action", action);
            fd.append("continueOnErrors", continueOnErrors ? "yes" : "no");
            fd.append("dateFormat", dateFormat);
            fd.append("fields", fields.join(","));

            $.ajax({
                type: "POST",
                url: "data/events/" + eventId + "/climbers-upload",
                data: fd,
                enctype: 'multipart/form-data',
                processData: false,  // tell jQuery not to process the data
                contentType: false   // tell jQuery not to set contentType
            }).done(function(data) {
                result.resolve(data);
            }).fail(function(jqXHR) {
                logger.error(module, "Upload event climbers file failed: " + getMessage(jqXHR));
                result.reject(getStatus(jqXHR), getMessage(jqXHR));
            });
            return result.promise();
        },

        // =====================================
        // Event Routes
        // =====================================

        //
        // GET /data/events/<event-id>/routes
        //
        fetchRoutes: function(eventId, round) {
            var result = $.Deferred(),
                self = this;

            logger.debug(module, "Fetch event routes");
            $.ajax({
                url: "/data/events/" + eventId + "/routes?round=" + round,
                dataType: "json"
            }).done(function(data) {
                result.resolve(data);
            }).fail(function(jqXHR) {
                logger.error(module, "Fetch event routes failed: " + getMessage(jqXHR));
                result.reject(getStatus(jqXHR), getMessage(jqXHR));
            });
            return result.promise();
        },

        //
        // PUT /data/events/<event-id>/routes
        // xxx also does create
        updateRoutes: function(event, route) {
            throw "todo";
        },

        // find by first or last name or team or usa climbing member id
        findClimbers: function(search) {
            var i, climber, climbers, re,
                result = [];

            search = $.trim("" + search);
            if (!this.currentEvent || !this.currentEvent.climbers) {
                logger.debug(module, "Nothing to find");
                return result; // nothing to find
            }
            climbers = this.currentEvent.climbers;
            if (/^\d+$/.test(search)) {
                for (i = 0; i < climbers.length; i++) {
                    climber = climbers[i];
                    if (("" + climber.usacMemberId).indexOf(search) >= 0) {
                        result.push(climber);
                    }
                }
            } else {
                re = new RegExp("(" + search.split(/\s+/).join(")|(") + ")", "i");
                for (i = 0; i < climbers.length; i++) {
                    climber = climbers[i];
                    if (re.test(climber.firstName) || re.test(climber.lastName) || re.test(climber.team)) {
                        result.push(climber);
                    }
                }
            }
            logger.debug(module, "Find climbers found " + result.length + " results");
            return result;
        },

        setCurrentClimber: function(bibNumber) {
            var climber;
            if (!this.currentEvent || !this.currentEvent.climbers) {
                throw "No current event";
            }
            this.currentClimber = null;
            this.scoreCardDirty = false;
            climber = this.currentEvent.climberIndex[bibNumber];
            if ( climber ) {
                this.currentClimber = climber;
                return true;
            } // else
            return false;
        },

        updateCurrentClimberScoreCard: function(scoreCard) {
            logger.debug(module, "Update Current Climber Scorecard");
            if (!this.currentClimber) {
                throw "No current climber";
            }
            this.scoreCardDirty = true;
            this.currentClimber.scoreCard = scoreCard;
        },

        getPercentComplete: function() {
            var i,
                total = 0,
                withCard = 0,
                currentEvent = this.currentEvent;

            if (!currentEvent || !this.currentEvent.climbers) {
                throw "No current event";
            }
            for (i = 0; i < currentEvent.climbers.length; i++) {
                total += 1;
                if (currentEvent.climbers[i].scoreCard) {
                    withCard += 1;
                }
            }
            return Math.ceil(withCard/total * 100);
        },

        //
        // PUT /data/events/<event-id>/results/<climber-id>
        // updateCurrentClimberScoreCard must already have been called
        saveCurrentClimberScoreCard: function() {
            var bibNumber, eventId, data,
                self = this,
                result = $.Deferred();

            logger.debug(module, "Save Current Climber Scorecard");
            if (!this.currentEvent) {
                throw "No current event";
            }
            if (!this.currentClimber) {
                throw "No current climber";
            }
            eventId = this.currentEvent.eventId;
            bibNumber = this.currentClimber.bibNumber;

            data = $.extend({}, this.currentClimber.scoreCard); // xxx how much to send? may not need to persist the score because it can be calculated. The element ids may not make sense
            data.climbs = this.currentClimber.scoreCard.climbs;
            data.version = this.currentClimber.version;
            $.ajax({
                type: "PUT",
                url: "data/events/" + eventId + "/results/" + bibNumber,
                contentType: "application/json",
                data: JSON.stringify(data),
                dataType: "json"
            }).done(function(data) {
                self.scoreCardDirty = false;
                if (data.climberId === self.currentClimber.climberId) {
                    console.log("xxx update current climber after update response");
                    self.currentClimber.version = data.version;
                    self.currentClimber.scoredBy = data.scoredBy;
                    self.currentClimber.scoredOn = data.scoredOn;
                }
                result.resolve();
            }).fail(function(jqXHR) {
                logger.error(module, "Update current climber scorecard failed: " + getMessage(jqXHR));
                result.reject(getStatus(jqXHR), getMessage(jqXHR));
            });
            return result.promise();
        },

        //
        // GET /data/events/<event-id>/results
        // xxx group: all, category/gender, team
        // xxx todo implement filter local or on server?
        fetchEventResults: function(eventId, round) {
            var result = $.Deferred();

            logger.debug(module, "Fetch Event Results");

            $.ajax({
                url: "/data/events/" + eventId + "/results?round=" + round,
                dataType: "json"
            }).done(function(data) {
                logger.info(module, "Fetch event results loaded " + data.length + " results");
                // xxx todo want more stats: average per gender/category, total climbers finished, finishes in each category, total per team
                result.resolve(data);
            }).fail(function(jqXHR) {
                logger.error(module, "Fetch event results failed: " + getMessage(jqXHR));
                result.reject(getStatus(jqXHR), getMessage(jqXHR));
            });

            return result.promise();
        },


        //xxx
        uploadEventRoutes: function(eventId, round, routesHaveLocation, routesHaveColor, scoreCardColumns, version, file) {
            var fd,
                self = this,
                result = $.Deferred();

            logger.debug(module, "Upload Event Routes. File: " + file.name);

            fd = new FormData();
            fd.append("file", file);
            fd.append("routesHaveLocation", routesHaveLocation);
            fd.append("routesHaveColor", routesHaveColor);
            fd.append("scoreCardColumns", scoreCardColumns);
            fd.append("version", version);
            $.ajax({
                type: "POST",
                url: "data/events/" + eventId + "/routes-upload?round=" + round,
                data: fd,
                enctype: 'multipart/form-data',
                processData: false,  // tell jQuery not to process the data
                contentType: false   // tell jQuery not to set contentType
            }).done(function(/*data*/) {
                console.log("xxx upload ok");
                result.resolve();
            }).fail(function(jqXHR) {
                logger.error(module, "Upload file failed: " + getMessage(jqXHR));
                result.reject(getStatus(jqXHR), getMessage(jqXHR));
            });
            return result.promise();
        },

        // =====================================
        // Users
        // =====================================

        //
        // GET /data/users
        //
        fetchUsers: function() {
            var result = $.Deferred(),
                self = this;

            logger.debug(module, "Fetch Users");
            $.ajax({
                url: "/data/users",
                dataType: "json"
            }).done(function(data) {
                result.resolve(data.items);
            }).fail(function(jqXHR) {
                logger.error(module, "Fetch users failed: " + getMessage(jqXHR));
                result.reject(getStatus(jqXHR), getMessage(jqXHR));
            });
            return result.promise();
        },

        //
        // GET /data/users/<username>
        //
        fetchUser: function(username) {
            var result,
                self = this;

            logger.debug(module, "Fetch user " + username);

            if (username === "") {
                throw "Username is required";
            }

            result = $.Deferred();
            $.ajax({
                url: "data/users/" + username,
                dataType: "json"
            }).done(function(data) {
                result.resolve(data);
            }).fail(function(jqXHR) {
                logger.error(module, "Fetch user failed: " + getMessage(jqXHR));
                result.reject(getStatus(jqXHR), getMessage(jqXHR));
            });
            return result.promise();
        },

        //
        // POST /data/users
        //
        createUser: function(user) {
            var result,
                self = this;

            logger.debug(module, "Create user " + user.username);

            result = $.Deferred();
            $.ajax({
                type: "POST",
                url: "data/users",
                contentType: "application/json",
                data: JSON.stringify(user),
                dataType: "json"
            }).done(function(data) {
                result.resolve(data);
            }).fail(function(jqXHR) {
                logger.error(module, "Create user failed: " + getMessage(jqXHR));
                result.reject(getStatus(jqXHR), getMessage(jqXHR)); // xxx item errors
            });
            return result.promise();
        },

        //
        // PUT /data/users/<username>
        //
        updateUser: function(user) {
            var result,
                username = user.username,
                self = this;

            logger.debug(module, "Update user " + username);

            result = $.Deferred();
            $.ajax({
                type: "PUT",
                url: "data/users/" + username,
                contentType: "application/json",
                data: JSON.stringify(user),
                dataType: "json"
            }).done(function(data) {
                result.resolve(data);
            }).fail(function(jqXHR) {
                logger.error(module, "Update user failed: " + getMessage(jqXHR));
                result.reject(getStatus(jqXHR), getMessage(jqXHR)); // xxx item errors
            });
            return result.promise();
        },
        // xxx specific set password API

        //
        // DELETE /data/users/<username>
        //
        deleteUser: function(username, version) {
            var result;

            logger.debug(module, "Delete user " + username + " at version " + version);

            result = $.Deferred();
            $.ajax({
                type: "DELETE",
                url: "data/users/" + username + "?version=" + version,
                dataType: null
            }).done(function(data) {
                result.resolve();
            }).fail(function(jqXHR) {
                logger.error(module, "Delete user failed: " + getMessage(jqXHR));
                result.reject(getStatus(jqXHR), getMessage(jqXHR));
            });
            return result.promise();
        }

    };

})(jQuery, logger, util);
