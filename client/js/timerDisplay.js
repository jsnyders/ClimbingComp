/*global jQuery, logger, app, appModel, util, AudioContext*/
/*
 Timer Admin and display pages
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

/*
 * xxx todo
 * consider if should display current cycle anywhere
 * consider if there should be a separate option to turn audio on/off
 * popup to prompt for duration etc.
 * make display fill the screen and be responsive
 */

(function(app, model, $, logger, util, undefined) {
    "use strict";

    var module = "AdminTimer";

    var audioContext = null;

    try {
        // Fix up for prefixing
        window.AudioContext = window.AudioContext||window.webkitAudioContext;
        audioContext = new AudioContext();
    }
    catch(e) {
        alert('Audio is not supported by this browser. Timer announcements will not be heard.');
    }

    var sounds = {
        "begin": { url: "/snd/cs1.wav" },
        "oneMinWarning": { url: "/snd/c60.wav" },
        "tenSecWarning": { url: "/snd/c10.wav" },
        "beginTransition": { url: "/snd/ts.wav" },
        "endBegin": { url: "snd/cs0.wav" }
    };

    function loadSounds(sounds, callback) {
        var k, sound, count;

        function loadSound(s) {
            var request = new XMLHttpRequest();

            request.open('GET', s.url, true);
            request.responseType = 'arraybuffer';

            // Decode asynchronously
            request.onload = function () {
                audioContext.decodeAudioData(request.response, function (buffer) {
                    s.buffer = buffer;
                    count -= 1;
                    logger.debug(module, "Sound file loaded: " + s.url);
                    if (count === 0) {
                        callback();
                    }
                }, function () {
                    s.buffer = null;
                    //xxx error function
                });
            };
            request.send();
        }

        count = 0;
        for (k in sounds) {
            if ( sounds.hasOwnProperty(k)) {
                count += 1;
            }
        }
        for (k in sounds) {
            if ( sounds.hasOwnProperty(k)) {
                sound = sounds[k];
                loadSound(sound);
            }
        }

    }

    function playSound(name) {
        var buffer,
            source = audioContext.createBufferSource();

        if (sounds[name]) {
            buffer = sounds[name].buffer;
            if (buffer) {
                source.buffer = buffer;
                source.connect(audioContext.destination);
                source.start(0);
            }
        }
    }

    if (audioContext) {
        loadSounds(sounds, function(err) {
            logger.debug(module, "All sounds loaded");
        });
    }

    /*
     * xxx for testing time display using local timer
     */
    // duration and updateInterval in seconds
    function beginTimer(duration, updateInterval) {
        var startTime, nextTime, countdownTime;

        function update() {
            var delta;

            nextTime += updateInterval;
            countdownTime -= updateInterval;
            updateDisplay(countdownTime);

            if ( countdownTime === 60 * 1000) {
                console.log("xxx one minute warning");
                playSound("oneMinWarning");
            } else if ( countdownTime === 10 * 1000 ) {
                console.log("xxx ten second warning");
                playSound("tenSecWarning");
            }

            if ( countdownTime > 0 ) {
                delta = (nextTime - Date.now());
                console.log("xxx delta: " + delta);
                setTimeout(update, delta);
            } else {
                updateDisplay(countdownTime);
                playSound("endBegin");
                console.log("xxx total seconds " + (Date.now() - startTime) / 1000);
            }
        }

        updateInterval *= 1000;
        countdownTime = duration * 1000;
        startTime = Date.now();
        nextTime = startTime + updateInterval;
        setTimeout(update, updateInterval);
        updateDisplay(countdownTime);
        playSound("begin");
    }
    /*
     * xxx end for testing
     */

    function updateDisplay(time, transition) {
        var text, sec, min;

        if (typeof time === "string") {
            text = time;
        } else {
            sec = Math.floor(time / 1000);
            min = Math.floor(sec / 60);
            sec = sec % 60;
            text = (transition ? "T" : "") + min + ":" + util.zeroPad(sec, 2);
        }
        $("#timerTime").text(text);
    }

    var timerSocket = null;
    
    function connectToTimer(eventId) {
        var url = (location.protocol === "https:" ? "wss" : "ws") + "://"  + location.host + "/timer/" + eventId;

        if (timerSocket !== null) {
            throw new Error("Already connected");
        }
        timerSocket = new WebSocket(url);

        timerSocket.onmessage = function(event) {
            var msg = JSON.parse(event.data);
            if (msg.milestone === "pause") {
                updateDisplay("pause");
            } else if (msg.milestone === "endTimer") {
                updateDisplay("-:--");
            } else {
                updateDisplay(msg.countdownTime, msg.transition);
                if (msg.milestone) {
                    playSound(msg.milestone);
                }
            }
        };

        timerSocket.onerror = function(event) {
            console.log("xxx socket error ", event);
        };

        timerSocket.onclose = function(event) {
            logger.debug(module, "Socket close reason: " + event.reason);
            updateDisplay("-:--");
        };
    }

    function disconnectFromTimer() {
        if (timerSocket === null) {
            throw new Error("Not connected");
        }
        timerSocket.close(1000, "disconnect");
        timerSocket = null;
        updateDisplay("-:--");
    }

    app.addPage({
        name: "timerDisplay",
        init: function() {
            updateDisplay("-:--");
        },
        prepare: function() {
            app.clearMessage(this.name);
        },
        open: function(ui) {
            logger.debug("DisplayTimer", "Page is now active");
        }
    });

    function updateTimerButtons(data) {
        $("#createTimer,#pauseTimer,#resumeTimer,#deleteTimer,#connectTimer,#disconnectTimer,#displayTimer").hide();
        if (!data) {
            $("#createTimer").show();
        } else {
            if (data.running) {
                $("#pauseTimer,#deleteTimer").show();
            } else {
                $("#resumeTimer,#deleteTimer").show();
            }
            $("#displayTimer").show();
            if (timerSocket) {
                $("#disconnectTimer").show();
            } else {
                $("#connectTimer").show();
            }
        }
    }

    app.addPage({
        name: "adminTimer",
        init: function() {
            $("#createTimer").click(function() {
                // xxx don't hard code these
                model.createTimer(model.currentEvent.eventId, 120, 0)
                    .done(function(data) {
                        updateTimerButtons(data);
                    })
                    .fail(function(status, message) {
                        app.showErrorMessage(status, "Failed to create timer", message);
                    });
            });
            $("#pauseTimer").click(function() {
                // xxx option to pause at end of cycle
                model.pauseTimer(model.currentEvent.eventId, true)
                    .done(function(data) {
                        updateTimerButtons(data);
                    })
                    .fail(function(status, message) {
                        app.showErrorMessage(status, "Failed to pause timer", message);
                    });
            });
            $("#resumeTimer").click(function() {
                model.resumeTimer(model.currentEvent.eventId, true)
                    .done(function(data) {
                        updateTimerButtons(data);
                    })
                    .fail(function(status, message) {
                        app.showErrorMessage(status, "Failed to resume timer", message);
                    });
            });
            $("#deleteTimer").click(function() {
                model.destroyTimer(model.currentEvent.eventId, true)
                    .done(function(data) {
                        updateTimerButtons(data);
                    })
                    .fail(function(status, message) {
                        app.showErrorMessage(status, "Failed to delete timer", message);
                    });
            });
            $("#connectTimer").click(function() {
                connectToTimer(model.currentEvent.eventId);
            });
            $("#disconnectTimer").click(function() {
                disconnectFromTimer();
            });
        },
        prepare: function() {
            app.clearMessage(this.name);
            $("#createTimer,#pauseTimer,#resumeTimer,#deleteTimer,#connectTimer,#disconnectTimer,#displayTimer").hide();
        },
        open: function(ui) {
            logger.debug(module, "Page is now active");

            if (!model.currentEvent) {
                logger.debug(module, "No current event so must return to home page");
                $("body").pagecontainer("change", $("#home"));
                return;
            }

            model.getTimer(model.currentEvent.eventId)
                .done(function(data) {
                    updateTimerButtons(data);
                })
                .fail(function(status, message) {
                    updateTimerButtons(null);
                });
            
        }
    });

})(app, appModel, jQuery, logger, util);
