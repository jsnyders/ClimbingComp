/**
 * createEvent.js
 * Utility program to load Climbing Comp database with a new event
 * Copyright (c) 2014, John Snyders
 */
/* jshint node: true, strict: false */

var db = require('mysql');

// xxx get this from config
var dbDatabase = "climbing_comp",
    dbUser = "john",
    dbPassword = "john";

var dbConnection;

var region, eventLocation, eventDate,
    args = process.argv.slice(2),
    regions = ",101 (Washington / Alaska),102 (Northwest),103 (Northern California)," +
              "201 (Southern California),202 (Southern Mountain),203 (Colorado)," +
              "301 (Midwest),302 (Ohio River Valley),303 (Mid-Atlantic)," +
              "401 (Heartland),402 (Bayou),403 (Deep South)," +
              "501 (Capital),502 (New England West),503 (New England East),",
    regionList = regions.substring(1, regions.length - 1).split(",");

function usage() {
    console.log("Usage:");
    console.log("  node createEvent.js help | -h");
    console.log("  node createEvent.js region location date");
    console.log("");
    console.log("Prints event id which is used when adding climbers and routes to event.");
    console.log("Enter date as yyyy/mm/dd");
    console.log("Valid regions (can enter exact full string in quotes or just the 3 digits");
    for (var i = 0; i < regionList.length; i++) {
        console.log("    " + regionList[i]);
    }
}

function insert(event) {
    dbConnection.query("INSERT INTO event SET ?;", event, function(err, result) {
        if (err) {
            throw err;
        }
        console.log("Added event \"" + event.location + "\" on " + event.event_date + ". Event ID=" + result.insertId);
        dbConnection.end();
    });
}

function stringInSet(string, values) {
    return values.indexOf("," + string + ",") >= 0;
}

if (args.length >= 1 && (args[0] === "help" || args[0] === "-h")) {
    usage();
    process.exit();
}

if (args.length !== 3) {
    console.log("Missing required arguments");
    usage();
    process.exit();
}
region = args[0];
eventLocation = args[1];
eventDate = args[2];

if (region.match(/^\d\d\d$/)) {
    // look it up
    for (var i = 0; i < regionList.length; i++) {
        if (regionList[i].substring(0,3) === region) {
            region = regionList[i];
            break;
        }
    }
}
if (!stringInSet(region, regions)) {
    console.log("Error: Invalid region: " + region);
    usage();
    process.exit();
}

dbConnection = db.createConnection({
    host: 'localhost',
    user: dbUser,
    password: dbPassword,
    database: dbDatabase
});

dbConnection.connect();

var theEvent = {
    region: region,
    location: eventLocation,
    event_date: eventDate,
    series: "SCS",
    type: "Red Point",
    sanctioning: "Local",
    routes_have_location: true,
    routes_have_color: true,
    record_falls_per_climb: false
};
insert(theEvent);
