# Rules for Scoring and Ranking competitions used by ClimbingComp 

This is an explanation of how ClimbingComp scores and ranks climbers in competitions. Only the scoring is
described here. Other aspects of the competition such as rules for climbing, how much time to allow,
how many routes to set etc. are also important but don't have an impact on the scoring and ranking formulas.

## Redpoint format
In a redpoint climbing competition there are a number of routes each designated with a point value based on its 
difficulty (higher numbers are more difficult). Climbers can attempt as many routes as they have time for and 
may attempt the same route multiple times. Climbers only receives points for topping a route. A climber's
total score is the sum of the points of the N largest valued routes (top N) they topped (completed). Where N is a 
parameter of the competition round; an integer between 1 and 6. The total number of falls on the top N routes is used
to break ties. If the total score and total number of falls is the same (a tie) then the next highest point value route 
climbed by each tied climber is considered. If there is still a tie then the number of falls on that route is considered.
This process of considering additional routes and falls continues for up to 10 routes total (this includes the 
initial top N so if N is 3 and there is a tie then up to 7 more routes and falls will be considered). In the unlikely
event that 10 routes is not enough to break the tie then the climbers are tied.

### Recording
The score card lists each route along with its point value and a blank space to record the number of falls and
a blank space to record judges initials indicating the root was topped (and points awarded). Falls are indicated 
with a tally mark for each fall. The scorecard has its routes listed in order from lowest to highest. 
Routes are identified with a sequential number starting from 1 and may include other identifying information such
as location or color. 

### Data entry
Data is entered into ClimbingComp from the scorecard more or less as is but there are some options both in what 
the app does and in how it is used. When you create the event you can decide if you want to enter the number of falls
for each of the top N routes and have the app calculate the total or just enter the total. This is controlled with
the *Record Falls per Climb* option. It is typically faster to add the falls in your head and just click the total 
falls at the top. This is limited to 19 falls. Entering the number of falls per climb is limited to 9 falls per climb.

It is best to scan the scorecard from bottom (highest point routes) to top (lowest). For each topped route as 
indicated by initials click the Yes/No toggle so that it reads Yes. You can stop after the top N routes have been
recorded or you can enter all the topped routes on the card. The total points at the top turns green when
N routes have been recorded. As long as there are no ties it is faster to just enter the top N routes. Later if you 
find out there are ties then you can go back to the scorecards for those climbers and enter all the routes. 
TODO there needs to be a way to enter falls per climb at this point.

### Scoring
The following information is stored or calculated for the purpose of scoring and ranking the climbers.
For each climber: The points for each of N highest point valued routes they topped are stored. 
Call these: T[1], T[2] ... T[N]. The total number of falls on the N highest point valued routes is stored. Call this TF.
The total score (call it TS) is calculated as the sum of the T values: TS = T[1] + T[2] + ... + T[N]. If the climber
topped fewer than N routes then just sum up as many as they did top.

In addition, for the purpose of breaking ties beyond the top N routes a character string is created as follows
For each route topped (in decreasing point value order) from N + 1 to 10 concatenate the zero padded to 6 characters
point value of the route with the zero padded to two characters 99 - number of falls on that route. 
Call this TB (for tie breaker).

```
TB = pad(T[N + 1], 6) | pad(99 - F[N + 1], 2) | pad(T[N + 2], 6) | pad(99 - F[N + 2], 2) | ... | pad(T[10], 6) | pad(99 - F[10], 2)  
```

If a climber topped fewer than 10 routes then the TB string will end after the last route topped. This means that
it is possible for TB to be the empty string if the climber only climbed N routes. The purpose of this TB string is
that it can be compared lexicographically to determine ranking. Greater values are better.

Notation: *pad* is a function that takes its first argument, a number, and converts it to a string and adds zeros on
the left until the string is its second argument characters long. So pad(77, 4) results in "0077". The bar 
character (|) is the string concatenation operator. T is an ordered array of topped routes from highest to lowest. 
F is an array of the number of falls attempting a given route. It is ordered the same as T so that F(x) is the number
of falls while attempting route T(x).

The implementation relies on the following assumptions: 

* N must be less than 10. The app restricts N to between 1 and 6 inclusive.
* The point value of a route must be less than 6 digits. They typically range from 500 to 1500. 
* There must be fewer than 99 falls. The app only lets you enter 19 for total and up to 9 for an individual climb.

### Ranking
Ranking climbers is accomplished by sorting on the above described scoring information. After grouping climbers by
gender and category, sort by TS descending, then by TF ascending, and finally by TB descending.
The first climber in the returned order is given place 1, the second climber place 2 and so on. The nth climber
in the above given order is in nth place except that if two or more climbers have the same ranking then they are tied
and receive the same place rank. The order in which tied climbers are listed is not defined.

### Reporting
The report is broken down by gender and category. For each cliber the following columns are included:

```
Bib Number, Member Number, First Name, Last Name, Region, Team, Place, Total Score, Total Fals, Best 1, Best 2, ... Best N
```

The report also includes as necessary a note about ties as a popup. These are the possible cases:

* If there is a tie and no additional tie breaker data is available then the assumption is that during data entry 
people stopped entering data after N tops. So the note reminds you that it may be possible to break the tie
by entering more climbs. It is possible that there are no more climbs to enter in which case the note can be ignored
and the tie stands.
* If there is a tie in the total score and total falls **but** it was broken by looking at additional routes
then the note tells you so and reminds you to double check the score cards (because people may not have been consistent
or as carefull entering routes after the top N). The reason for this note is that you can't tell just by looking 
at the results why climbers with the same score and falls came in different places (were not tied).
* If there is a tie that cannot be broken then there is no note.

TODO provide an option to include Total Falls and/or Attempts.

TODO consider showing who last entered the scorecard and possibly when.

The CSV export file includes the gender and category as columns. It also includes both total falls and total attempts.
It includes the username of the person that last entered the scorecard.


### Notes
These rules are based on the [2015-206 USA Climbing Rule Book](http://sports.activecm.net/Assets/USA+Climbing+Digital+Assets/Documents/2015-2016+USA+Climbing+Rule+Book.pdf).

The USA Climbing rules always deal with attempts rather than falls. ClimbingComp records falls.
In the past there has been confusion over recording attempts or falls. The climbers and sometimes even judges tend
to forget to mark an attempt for a flash. Either recording falls or attempts can work as long as the instructions are
clear and followed consistently. The formula for converting from total falls to total attempts (TA) is straight forward

```
TA = TF + ifnull(T[1], 0, 1) + ifnull(T[2], 0, 1) + ... + ifnull(T[N], 0, 1)
```

This adds to TF 1 for each of top route up to N.

Notation: *ifnull* is a function that return its second argument if the first argument is null (or zero) and
its third argument otherwise. 

TODO provide an option to use attempts or falls.


## Onsight format

TBD

## Flash format

TBD
