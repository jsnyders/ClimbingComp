/*global console */
/*
 * logger.js
 * Logging utility
 * Copyright (c) 2014, John Snyders
 * todo unit tests, support args
 */
var logger = (function() {
    "use strict";

    var LEVEL_DEBUG = 4,
        LEVEL_INFO = 3,
        LEVEL_WARN = 2,
        LEVEL_ERROR = 1,
        LEVEL_NONE = 0;

    var level = LEVEL_NONE,
        facility = {};

    var debug, info, warn, error;

    function logFacility(facilityName) {
        return !facilityName || facility[facilityName] || facility["*"];
    }

    debug = info = warn = error = function() { };

    if ( console && console.log ) {
        error = function(message) {
            console.error(message);
        };
        warn = function(message) {
            console.warn(message);
        };
        info = function(message) {
            console.info(message);
        };
        debug = function(message) {
            console.log(message);
        };
    }

    return {
        LEVEL_DEBUG: LEVEL_DEBUG,
        LEVEL_INFO: LEVEL_INFO,
        LEVEL_WARN: LEVEL_WARN,
        LEVEL_ERROR: LEVEL_ERROR,
        LEVEL_NONE: LEVEL_NONE,

        setFacility: function(name, on) {
            facility[name] = !!on;
        },

        setLevel: function(l) {
            level = l;
        },
        getLevel: function() {
            return level;
        },

        logFacility: function(facilityName) {
            logFacility(facilityName);
        },

        logError: function(facilityName) {
            return level >= LEVEL_ERROR && logFacility(facilityName);
        },
        logWarn: function(facilityName) {
            return level >= LEVEL_WARN && logFacility(facilityName);
        },
        logInfo: function(facilityName) {
            return level >= LEVEL_INFO && logFacility(facilityName);
        },
        logDebug: function(facilityName) {
            return level >= LEVEL_DEBUG && logFacility(facilityName);
        },

        error: function(facilityName, message) {
            if (level >= LEVEL_ERROR && logFacility(facilityName)) {
                error(facilityName + ": Error: " + message);
            }
        },
        warn: function(facilityName, message) {
            if (level >= LEVEL_WARN && logFacility(facilityName)) {
                warn(facilityName + ": Warning: " + message);
            }
        },
        info: function(facilityName, message) {
            if (level >= LEVEL_INFO && logFacility(facilityName)) {
                info(facilityName + ": " + message);
            }
        },
        debug: function(facilityName, message) {
            if (level >= LEVEL_DEBUG && logFacility(facilityName)) {
                debug(facilityName + ": " + message);
            }
        }
    };

})();