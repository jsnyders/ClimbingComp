/*
 timers.js
 Resources related to comp running timers

 Copyright (c) 2015, John Snyders

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

/*
 * Manage timers start, stop etc.
 * A global repeating countdown interval timer with optional transition period for climbing competitions.
 * 
 * Related tables:
 * - config todo
 */

var restify = require("restify");
var auth = require("../auth");
var conv = require("../conv");
var errors = require("../errors");

var InvalidInput = errors.InvalidInput;


var updateInterval = 1000, // 1 second
    maxClimbingTime = 20 * 60, // 20 min
    maxTransitionTime = 5 * 60, // 5 min
    timers = {};

function updateTimer(timer) {
    var delta,
        end = false,
        milestone = null;

    timer.nextTime += updateInterval;
    timer.countdownTime -= updateInterval;

    if (timer.countdownTime > 0) {
        // check for milestones
        if (timer.milestones && !timer.transition) {
            milestone = timer.milestones["" + Math.floor(timer.countdownTime / 1000)] || null;
        }
    } else {
        if (!timer.transitionDuration) {
            milestone = "endBegin";
        } else if (!timer.transition) {
            milestone = "beginTransition";
        } else {
            milestone = "begin"; // xxx perhaps begin on max duration not on zero
        }
    }
    notifyListeners(timer, milestone);
    if (timer.countdownTime <= 0) {
        if (timer.pause) {
            end = true;
            delete timer.pause;
            timer.id = null;
            notifyListeners(timer, "pause"); // xxx trouble is that the endBegin has already been sent
        } else {
            if (timer.transitionDuration && !timer.transition) {
                timer.countdownTime = timer.transitionDuration; // xxx perhaps add updateInterval
                timer.transition = true;
            } else {
                timer.transition = false;
                timer.countdownTime = timer.climbingDuration; // xxx perhaps add updateInterval
                timer.cycle += 1;
            }
        }
    }

    if (!end) {
        delta = timer.nextTime - Date.now();
        timer.id = setTimeout(function() {
            updateTimer(timer);
        }, delta);
    }
}

function notifyListeners(timer, milestone) {
    var i,
        listeners = timer.listeners;

    for (i = 0; i < listeners.length; i++) {
        listeners[i](timer.countdownTime, milestone, timer.transition, timer.cycle);
    }
}

/**
 * This is a singleton Object to manage one or more independent named timers.
 * @type {{beginTimer: Function, statTimer: Function, pauseTimer: Function, resumeTimer: Function, endTimer: Function, subscribe: Function, unsubscribe: Function}}
 */
var timerManager = {
    /**
     * Create a new timer with the given name. 
     * Has no effect if the timer already exists.
     * 
     * @param {string} name a unique name for the timer.
     * @param {boolean} paused true to create the timer initially in the paused state, false start the timer right away
     *                      if starting paused call resumeTimer.
     * @param {integer} climbingDuration duration of climbing interval in whole seconds. Must be > 0.
     * @param {integer} transitionDuration duration of transition interval in whole seconds or 0 if there is no transition.
     * @param {object} milestones map seconds to string
     * @return {boolean} true if the timer is created
     */
    beginTimer: function(name, paused, climbingDuration, transitionDuration, milestones) {
        var timer = timers[name];
        if (!timer) {
            timer = {
                climbingDuration: climbingDuration * 1000,
                transitionDuration: transitionDuration * 1000,
                countdownTime: climbingDuration * 1000,
                milestones: milestones,
                cycle: 0,
                startTime: null,
                nextTime: null,
                transition: false,
                id: null,
                listeners: []
            };
            timers[name] = timer;
            if (!paused) {
                this.resumeTimer(name);
            }
        }
        return true;
    },

    /**
     * Return information about an existing timer given by name.
     * @param {string} name timer name
     * @returns {*} object with state of timer or null if there is no such timer given by name
     */
    statTimer: function(name) {
        var timer = timers[name];
        if (timer) {
            return {
                running: !!timer.id,
                cycle: timer.cycle,
                transition: timer.transition,
                countdownTime: timer.countdownTime
            };
        }
        return null;
    },

    /**
     * Pause the named timer. Has no effect if the timer is already paused.
     * 
     * @param {string} name timer name
     * @param {boolean} onNext if true the timer will be paused when it next reaches zero 
     * @returns {boolean} true if the timer exists and is or will be paused, false otherwise
     */
    pauseTimer: function(name, onNext) {
        var timer = timers[name];
        if (timer) {
            if (!timer.id) {
                return true; // already paused
            } // else
            if (onNext) {
                timer.pause = true;
            } else {
                if (timer.id) {
                    clearTimeout(timer.id);
                }
                timer.id = null;
                notifyListeners(timer, "pause");
            }
            return true;
        }
        return false;
    },

    /**
     * Resume the named timer. Has no effect if already running.
     * 
     * @param {string} name timer name
     * @returns {boolean} true if the timer exists and has been resumed, false otherwise
     */
    resumeTimer: function(name) {
        var timer = timers[name];
        if (timer) {
            if (timer.id) {
                return true; // already running
            }
            timer.startTime = Date.now();
            timer.nextTime = timer.startTime + updateInterval;
            // xxx persist start time
            timer.countdownTime = timer.climbingDuration;
            timer.cycle = 0;
            timer.transition = false;
            timer.id = setTimeout(function() {
                updateTimer(timer);
            }, updateInterval);
            notifyListeners(timer, "begin");
            return true;
        }
        return false;
    },

    /**
     * Stop and destroy the named timer.
     * @param {string} name timer name
     * @returns {boolean}
     */
    endTimer: function(name) {
        var timer = timers[name];
        if (timer) {
            if (timer.id) {
                clearTimeout(timer.id);
                timer.id = null;
            }
            delete timers[name];
            notifyListeners(timer, "endTimer");
            return true;
        }
        return false;
    },

    /**
     * Call given function when each second while the named timer is running.
     *
     * @param {string} name timer name
     * @param func
     * @returns {boolean}
     */
    subscribe: function(name, func) {
        var timer = timers[name];
        if (timer) {
            timer.listeners.push(func);
            return true;
        }
        return false;
    },

    /**
     * Remove the given function from the list of subscribers.
     *
     * @param {string} name timer name
     * @param func
     * @returns {boolean}
     */
    unsubscribe: function(name, func) {
        var i,
            timer = timers[name];

        if (timer) {
            for (i = 0; i < timer.listeners.length; i++) {
                if (timer.listeners[i] === func) {
                    timer.listeners.splice(i, 1);
                    return true;
                }
            } 
        }
        return false;
    }
};


function addResources(server, dbPool) {

    /*
     * Get timer state and time
     *
     * URI: data/timers/<eventId>
     * Method: GET
     * Role: Admin
     * Input: none
     * Output: object returned by timerManager.statTimer
     */
    server.get("data/timers/:eventId", function(req,res,next) {
        var result,
            eventId = conv.convertToIntegerId(req.params.eventId);

        if (!auth.validateAuthAndRole(auth.ROLE_ADMIN, req, next)) {
            return;
        }

        if (conv.isInvalid(eventId)) {
            return next(new restify.ResourceNotFoundError("Invalid event id"));
        }

        result = timerManager.statTimer(eventId);
        if (result) {
            res.send(result);
            return next();
        } // else
        return next(new restify.ResourceNotFoundError("No timer for event id"));
    });

    /*
     * Create timer
     *
     * URI: data/timers
     * Method: POST
     * Role: Admin
     * Input Object with these properties
     *   eventId {integer}
     *   climbingDuration {integer} duration in whole seconds
     *   transitionDuration {integer} duration of transition period or 0 for no transition
     * Output: object returned by timerManager.statTimer
     */
    server.post("data/timers", function(req,res,next) {
        var eventId, timer, climbingDuration, transitionDuration, paused,
            input = req.body;

        if (!auth.validateAuthAndRole(auth.ROLE_ADMIN, req, next)) {
            return;
        }

        eventId = conv.convertToIntegerId(input.eventId);
        if (conv.isInvalid(eventId)) {
            return new InvalidInput("bad event id for timer");
        }
        climbingDuration = conv.convertToInteger(input.climbingDuration);
        transitionDuration = conv.convertToInteger(input.transitionDuration);
        if (conv.isInvalid(climbingDuration) || climbingDuration <= 0 || climbingDuration > maxClimbingTime) {
            return new InvalidInput("bad climbing duration");
        }
        if (conv.isInvalid(transitionDuration) || transitionDuration < 0 || transitionDuration > maxTransitionTime) {
            return new InvalidInput("bad transition duration");
        }

        // xxx check if it already exists

        paused = true; // xxx
        timerManager.beginTimer(eventId, paused, climbingDuration, transitionDuration, {
            "60": "oneMinWarning",
            "10": "tenSecWarning"
        });
        // xxx only for debugging
//        timerManager.subscribe(eventId, function(countdownTime, milestone, transition, cycle) {
//            console.log("xxx timer " + eventId + ": " + cycle + ", " + countdownTime + (milestone ? " (" + milestone + ")" : ""));
//        });
        timerManager.resumeTimer(eventId);

        res.header("Location", "/data/timers/" + eventId);
        res.send(timerManager.statTimer(eventId));
        return next();
    });

    /*
     * Pause or resume a timer
     * Has no effect if the timer is already paused when paused or already running when resumed.
     * 
     * URI: data/timers/<eventId>
     * Method: PUT
     * Role: Admin
     * Input {state: "pause" | "pause-now" | "resume" }
     * Output: object returned by timerManager.statTimer
     */
    server.put("data/timers/:eventId", function(req,res,next) {
        var result,
            input = req.body,
            eventId = conv.convertToIntegerId(req.params.eventId);

        if (!auth.validateAuthAndRole(auth.ROLE_ADMIN, req, next)) {
            return;
        }

        if (conv.isInvalid(eventId)) {
            return next(new restify.ResourceNotFoundError("Invalid event id"));
        }

        if (input.state === "pause") {
            result = timerManager.pauseTimer(eventId, true);
        } else if (input.state === "pause-now") {
            result = timerManager.pauseTimer(eventId, false);
        } else if (input.state === "resume") {
            result = timerManager.resumeTimer(eventId);
        } else {
            return next(new InvalidInput("Invalid input"));
        }
        if (!result) {
            return next(new restify.ResourceNotFoundError("No timer for event id"));
        }

        result = timerManager.statTimer(eventId);
        if (result) {
            res.send(result);
            return next();
        } // else - this should not happen
        return next(new restify.ResourceNotFoundError("No timer for event id"));

    });

    /*
     * Delete timer
     *
     * URI: data/timers/<eventId>
     * Method: DELETE
     * Role: Admin
     * Input none
     * Output: none
     */
    server.del("data/timers/:eventId", function(req,res,next) {
        var eventId = conv.convertToIntegerId(req.params.eventId);

        if (!auth.validateAuthAndRole(auth.ROLE_ADMIN, req, next)) {
            return;
        }

        if (!timerManager.endTimer(eventId)) {
            return next(new restify.ResourceNotFoundError("No such timer"));
        }

        res.send(204,"No Content");
        res.next();
    });

}

var clientTimers = {};
var WebSocket = require("ws");

var timerConnectionManager  = {
    add: function(ws, eventId) {
        var timerEvent,
            self = this;

        if (!timerManager.statTimer(eventId)) {
            console.log("xxx timer connection manager no such timer");
            ws.close(1008, "no such timer");
            return;
        } // else

        timerEvent = clientTimers[eventId];
        if (!timerEvent) {
            console.log("xxx timer connection manager adding first client to timer " + eventId);
            timerEvent = {
                clients: []
            };
            timerManager.subscribe(eventId, function(countdownTime, milestone, transition, cycle) {
                var i, c, endCount = 0;

                for (i = 0; i < timerEvent.clients.length; i++) {
                    c = timerEvent.clients[i];
                    if (c.readyState !== WebSocket.OPEN) {
                        if (c.readyState === WebSocket.CLOSED) {
                            self.remove(c, eventId);
                        }
                        continue;
                    }
                    c.send(JSON.stringify({
                        countdownTime: countdownTime,
                        milestone: milestone,
                        transition: transition,
                        cycle: cycle
                    }), function(err) {
                        if (err) {
                            console("xxx ws send error: ", err);
                        }
                        if (milestone === "endTimer") {
                            endCount += 1;
                            if (endCount === timerEvent.clients.length) {
                                self.removeAll(eventId);
                            }
                        }
                    });
                }
            });
            clientTimers[eventId] = timerEvent;

            ws.on("message", function(message) {
                console.log('received: %s', message);
            });
            ws.on("error", function() {
                console.log("xxx ws on error");
            });
            ws.on("close", function() {
                self.remove(ws, eventId);
            });
        }
        console.log("xxx timer connection manager adding " + eventId);
        timerEvent.clients.push(ws);
    }, 

    remove: function(ws, eventId) {
        var i,
            timerEvent = clientTimers[eventId]; 

        if (timerEvent) {
            for (i = 0; i < timerEvent.clients.length; i++) {
                if (timerEvent.clients[i] === ws) {
                    timerEvent.clients.splice(i, 1); // delete this client;
                    break;
                }
            }
        }
    },

    removeAll: function(eventId) {
        var i, c,
            timerEvent = clientTimers[eventId];

        if (timerEvent) {
            for (i = 0; i < timerEvent.clients.length; i++) {
                c = timerEvent.clients[i];
                c.close(1000, "timer destroyed");
            }
            delete clientTimers[eventId];
        }
    }
};

module.exports = {
    addResources: addResources,
    timerManager: timerManager,
    timerConnectionManager: timerConnectionManager 
};
