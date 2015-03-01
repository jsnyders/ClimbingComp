/*global describe, it*/
/*jshint node: true, strict: false */

var assert = require("assert"),
    dbUtils = require("../lib/dbUtils"),
    errors = require("../lib/errors");

describe("dbUtils", function() {
    var person = {
        id: {
            column: "person_id",
            type: "number",
            noFilter: true,
            required: true
        },
        firstName: {
            column: "first_name",
            type: "string"
        },
        lastName: {
            column: "last_name",
            type: "string"
        },
        fullName: {
            column: "first_name || ' ' || last_name",
            type: "string",
            alias: "full_name",
            noSearch: true
        },
        age: {
            column: "age",
            type: "number"
        },
        picture: {
            column: "picture_blob",
            type: "bolb",
            noFilter: true,
            noOrder: true
        }
    };

    describe("createWhereExpression", function() {
        it("should return empty string when no filter or search params", function() {
            assert.equal(dbUtils.createWhereExpression(), "" );
            assert.equal(dbUtils.createWhereExpression(null, null, null), "" );
            assert.equal(dbUtils.createWhereExpression({}, "", ""), "" );
        });

        it("should return single expression for single filter", function() {
            assert.equal(dbUtils.createWhereExpression(person, "lastName:eq:Jones"), " last_name = 'Jones'" );
            assert.equal(dbUtils.createWhereExpression(person, "lastName:eq:"), " last_name = ''" ); // strange case
            assert.equal(dbUtils.createWhereExpression(person, "age:eq:60"), " age = 60" );
            assert.equal(dbUtils.createWhereExpression(person, "age:gt:30"), " age > 30" );
            assert.equal(dbUtils.createWhereExpression(person, "age:ge:30"), " age >= 30" );
            assert.equal(dbUtils.createWhereExpression(person, "age:lt:30"), " age < 30" );
            assert.equal(dbUtils.createWhereExpression(person, "age:le:30"), " age <= 30" );
            // xxx bool
            // xxx date
            assert.equal(dbUtils.createWhereExpression(person, "firstName:ne:Mark"), " first_name != 'Mark'" );
            assert.equal(dbUtils.createWhereExpression(person, "firstName:c:ly"), " first_name LIKE '%ly%' ESCAPE '!'" );
            assert.equal(dbUtils.createWhereExpression(person, "firstName:c:a%!_b"), " first_name LIKE '%a!%!!!_b%' ESCAPE '!'" );
        });

        it("should return multiple expression joined by AND for multiple filters", function() {
            assert.equal(dbUtils.createWhereExpression(person, ["lastName:eq:Jones", "age:ge:30","age:lt:40"]), " last_name = 'Jones' AND age >= 30 AND age < 40" );
            assert.equal(dbUtils.createWhereExpression(person, ["firstName:ne:Mark", "lastName:c:mac"]), " first_name != 'Mark' AND last_name LIKE '%mac%' ESCAPE '!'" );
        });

        it("should return expression for search", function() {
            assert.equal(dbUtils.createWhereExpression(person, null, "john"),
                " concat_ws('char(10)',first_name,last_name,age) LIKE '%john%' ESCAPE '!'" );
        });

        it("should return expression for multiple filters followed by search joined by AND", function() {
            assert.equal(dbUtils.createWhereExpression(person, ["age:ge:30", "age:lt:40"], "john"),
                " age >= 30 AND age < 40 AND concat_ws('char(10)',first_name,last_name,age) LIKE '%john%' ESCAPE '!'" );
        });

        it("should return invalid input error for invalid filters", function() {
            var result = dbUtils.createWhereExpression(person, ["age:ge:30", "age:l:40"], "");
            assert.ok(result instanceof errors.InvalidInput);
            assert.equal(result.message, "Bad filter parameter");

            result = dbUtils.createWhereExpression(person, ["age:ge:30", "age:eq"], "");
            assert.ok(result instanceof errors.InvalidInput);
            assert.equal(result.message, "Bad filter parameter");

            result = dbUtils.createWhereExpression(person, ["nosuch:ge:30", "age:eq"], "");
            assert.ok(result instanceof errors.InvalidInput);
            assert.equal(result.message, "Bad filter parameter; no such property");

            result = dbUtils.createWhereExpression(person, ["id:eq:1912"], "");
            assert.ok(result instanceof errors.InvalidInput);
            assert.equal(result.message, "Bad filter parameter; property not allowed");

            result = dbUtils.createWhereExpression(person, ["age:eq:old"], "");
            assert.ok(result instanceof errors.InvalidInput);
            assert.equal(result.message, "Bad filter parameter; bad value");
        });
    });

    describe("createLimitAndOffset", function() {
        it("should return limit and offset", function() {
            assert.equal(dbUtils.createLimitAndOffset("900:50"), " LIMIT 50 OFFSET 900" );
            assert.equal(dbUtils.createLimitAndOffset("0:20"), " LIMIT 20 OFFSET 0" );
        });

        it("should return invalid input error for bad page parameters", function() {
            var result = dbUtils.createLimitAndOffset("900");
            assert.ok(result instanceof errors.InvalidInput);
            assert.equal(result.message, "Bad page parameter");

            result = dbUtils.createLimitAndOffset("-900:10");
            assert.ok(result instanceof errors.InvalidInput);
            assert.equal(result.message, "Bad page parameter");

            result = dbUtils.createLimitAndOffset("900:a");
            assert.ok(result instanceof errors.InvalidInput);
            assert.equal(result.message, "Bad page parameter");

            result = dbUtils.createLimitAndOffset("");
            assert.ok(result instanceof errors.InvalidInput);

            result = dbUtils.createLimitAndOffset();
            assert.ok(result instanceof errors.InvalidInput);
        });
    });

    describe("getLimitAndOffset", function() {
        it("should return limit and offset", function() {
            assert.deepEqual(dbUtils.getLimitAndOffset("900:50"), [50, 900] );
        });

        it("should return null for bad page parameters", function() {
            assert.strictEqual(dbUtils.getLimitAndOffset("900"), null);
            assert.strictEqual(dbUtils.getLimitAndOffset("-900:10"), null);
            assert.strictEqual(dbUtils.getLimitAndOffset(" 100:20 "), null);
            assert.strictEqual(dbUtils.getLimitAndOffset(""), null);
            assert.strictEqual(dbUtils.getLimitAndOffset(null), null);
        });
    });

    describe("createOrderBy", function() {
        it("should return order by for single order param", function() {
            assert.equal(dbUtils.createOrderBy(person, "lastName:a"), " ORDER BY last_name ASC"); // ascending
            assert.equal(dbUtils.createOrderBy(person, "age:d"), " ORDER BY age DESC"); // descending
            assert.equal(dbUtils.createOrderBy(person, "fullName:a"), " ORDER BY full_name ASC"); // using alias
        });

        it("should return order by for multiple order params", function() {
            assert.equal(dbUtils.createOrderBy(person, ["lastName:a", "firstName:d"]), " ORDER BY last_name ASC, first_name DESC");
            assert.equal(dbUtils.createOrderBy(person, ["age:d", "lastName:d"]), " ORDER BY age DESC, last_name DESC");
        });

        it("should return invalid input error for bad order params", function() {
            var result;
            result = dbUtils.createOrderBy(person, ["lastName:d", "firstName:x"]);
            assert.ok(result instanceof errors.InvalidInput );
            assert.equal(result.message, "Bad order parameter");

            result = dbUtils.createOrderBy(person, "lastName");
            assert.ok(result instanceof errors.InvalidInput );
            assert.equal(result.message, "Bad order parameter");

            result = dbUtils.createOrderBy(person, "");
            assert.ok(result instanceof errors.InvalidInput );
            assert.equal(result.message, "Bad order parameter");

            result = dbUtils.createOrderBy(person, null);
            assert.ok(result instanceof errors.InvalidInput );
            assert.equal(result.message, "Bad order parameter");

            result = dbUtils.createOrderBy(person, ["nosuch:d", "firstName:x"]);
            assert.ok(result instanceof errors.InvalidInput );
            assert.equal(result.message, "Bad order parameter; no such property");

            result = dbUtils.createOrderBy(person, ["picture:d"]);
            assert.ok(result instanceof errors.InvalidInput );
            assert.equal(result.message, "Bad order parameter; property not allowed");
        });
    });

    describe("createCollectionQuery", function() {
        var query = "SELECT{{ |calcFoundRows}} special{{, |columns}} FROM table1{{ WHERE|filters}}{{order}}{{page}};";

        it("should return template as-is if it has no tokens", function() {
            assert.equal(dbUtils.createCollectionQuery("non template", person, {}), "non template");
        });

        it("should return query with no parameters", function() {
            assert.equal(dbUtils.createCollectionQuery(query, person, {}),
                "SELECT special, person_id, first_name, last_name, first_name || ' ' || last_name AS full_name, age, picture_blob FROM table1;");
        });

        it("should return query with filters", function() {
            assert.equal(dbUtils.createCollectionQuery(query, person, {filtersParam: "lastName:eq:Jones"}),
                "SELECT special, person_id, first_name, last_name, first_name || ' ' || last_name AS full_name, age, picture_blob FROM table1 WHERE last_name = 'Jones';");
            assert.equal(dbUtils.createCollectionQuery(query, person, {filtersParam: ["fullName:c:mark", "age:ge:16"]}),
                "SELECT special, person_id, first_name, last_name, first_name || ' ' || last_name AS full_name, age, picture_blob FROM table1 WHERE first_name || ' ' || last_name LIKE '%mark%' ESCAPE '!' AND age >= 16;");
            assert.equal(dbUtils.createCollectionQuery(query, person, {searchParam: "mac"}),
                "SELECT special, person_id, first_name, last_name, first_name || ' ' || last_name AS full_name, age, picture_blob FROM table1 WHERE concat_ws('char(10)',first_name,last_name,age) LIKE '%mac%' ESCAPE '!';");
        });

        it("should return query with columns", function() {
            assert.equal(dbUtils.createCollectionQuery(query, person, {columnsParam: "firstName,lastName"}),
                "SELECT special, person_id, first_name, last_name FROM table1;");
            assert.equal(dbUtils.createCollectionQuery(query, person, {columnsParam: "lastName,firstName"}),
                "SELECT special, person_id, last_name, first_name FROM table1;");
            assert.equal(dbUtils.createCollectionQuery(query, person, {columnsParam: "fullName,age"}),
                "SELECT special, person_id, first_name || ' ' || last_name AS full_name, age FROM table1;");
        });

        it("should return query with excluded columns", function() {
            assert.equal(dbUtils.createCollectionQuery(query, person, {excludeColumnsParam: "picture,fullName"}),
                "SELECT special, person_id, first_name, last_name, age FROM table1;");
        });

        it("should return query with page param", function() {
            assert.equal(dbUtils.createCollectionQuery(query, person, {excludeColumnsParam: "age,picture,fullName", pageParam: "100:20"}),
                "SELECT SQL_CALC_FOUND_ROWS special, person_id, first_name, last_name FROM table1 LIMIT 20 OFFSET 100;");
        });

        it("should return query with order param", function() {
            assert.equal(dbUtils.createCollectionQuery(query, person, {excludeColumnsParam: "age,picture,fullName", orderParam: "firstName:a"}),
                "SELECT special, person_id, first_name, last_name FROM table1 ORDER BY first_name ASC;");
            assert.equal(dbUtils.createCollectionQuery(query, person, {excludeColumnsParam: "age,picture,fullName", orderParam: ["firstName:a","lastName:d"]}),
                "SELECT special, person_id, first_name, last_name FROM table1 ORDER BY first_name ASC, last_name DESC;");
        });

        it("should return query with all option params", function() {
            assert.equal(dbUtils.createCollectionQuery(query, person, {
                    excludeColumnsParam: "age,picture,firstName,lastName",
                    pageParam: "1000:100",
                    filtersParam: "age:gt:20",
                    orderParam: "fullName:a"}),
                "SELECT SQL_CALC_FOUND_ROWS special, person_id, first_name || ' ' || last_name AS full_name FROM table1 WHERE age > 20 ORDER BY full_name ASC LIMIT 100 OFFSET 1000;");

            assert.equal(dbUtils.createCollectionQuery(query, person, {
                    columnsParam: "age,firstName,lastName",
                    pageParam: "1000:100",
                    filtersParam: "age:gt:20",
                    orderParam: "lastName:a"}),
                "SELECT SQL_CALC_FOUND_ROWS special, person_id, age, first_name, last_name FROM table1 WHERE age > 20 ORDER BY last_name ASC LIMIT 100 OFFSET 1000;");
        });

        it("should return invalid input error for any bad parameters", function() {
            assert.ok(dbUtils.createCollectionQuery(query, person, {excludeColumnsParam: "age,nosuch"}) instanceof errors.InvalidInput);
            assert.ok(dbUtils.createCollectionQuery(query, person, {columnsParam: "age,nosuch"}) instanceof errors.InvalidInput);
            assert.ok(dbUtils.createCollectionQuery(query, person, {filtersParam: "foo"}) instanceof errors.InvalidInput);
            assert.ok(dbUtils.createCollectionQuery(query, person, {orderParam: "age"}) instanceof errors.InvalidInput);
            assert.ok(dbUtils.createCollectionQuery(query, person, {pageParam: "first:50"}) instanceof errors.InvalidInput);
        });
    });


});
