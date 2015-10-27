# ClimbingComp

ClimbingComp is a rock climbing competition scoring app. It allows multiple people using tablets or laptops
to quickly enter scorecard data so final results can be posted fast.

It is in an early stage of development but has been used successfully at a few climbing competitions in 2014, 2015.

The traditional way of scoring a climbing competition relies on using spreadsheet software. This creates a data
entry bottleneck where only one person at a time can enter data. Even when the data entry is divided between
multiple people there is extra overhead in partitioning the scorecards and consolidating the results.
In addition spreadsheet software is not optimized for rapid scorecard entry.

ClimbingComp is designed to address the inherent problems with using a spreadsheet. ClimbingComp is a web application
so it can be used by many people at once, All the data is stored centrally. The UI is optimized for competition
scorecard data entry making it faster and reducing errors.

It is designed based on the USA Climbing climbing competition format and scoring rules but may be applicable, or
adapted to other situations.

Currently it only handles redpoint format comps.

Source: [https://github.com/jsnyders/ClimbingComp](https://github.com/jsnyders/ClimbingComp)

## Update 23-Oct
ClimbingComp is read for testing. We plan to use it at the 14-Nov-15 Boston Rock Gym ABS comp.
 
Notable improvements since last release:
* Made number of routes configurable (1 to 6)
* Made number of digits to use for bib number configurable (3 or 4)
* Implemented proper tie breaking rules 
* Updated with new USA Climbing regions
* Region, category and other configuration comes from the database
* Events have a workflow, added UI to move event from open to active to preliminary results to closed
* Changed default order of climber import columns to match latest USA Climbing spreadsheet
* Added UI to change password

## Features

* Its a web app that works on tablets, laptops, or desktops
* Data entry screen has same layout as scorecard for easy data entry

## License
GNU Affero General Public License. See LICENSE.txt for details.

## Setup
The following steps including installing development tools grunt-cli and bower. In the future the setup steps
will be simplified so that these tools are not needed.

### Install MariaDB

Get the 10.0 series MariaDB software from [https://downloads.mariadb.org](https://downloads.mariadb.org) and follow instructions.

MariaDB 5.5 and MySQL should also work but this has not been tested.

Test that MariaDB is installed with:

```
mysql --version
mysql -u root -p -h localhost
> exit
```

Depending on your OS and how MariDB is configured you may need to log into root as the root user

```
sudo mysql -u root -h localhost
> exit
```

You will need to know the username and password of a database user than has the permission to create new databases and users.

### Install Node.js
Download and install node.js from [http://nodejs.org/download/](http://nodejs.org/download/)
Add the node bin folder to the PATH and set NODE_PATH.
Test that node is working with:

```
node --version
node
> process.exit();
```

Currently developing and testing with node version v0.12.4. Need to verify working on newer versions of node.

The node package manager (npm) should come bundled with node.js. Two other node tools are needed.
Install grunt and bower globally:

```
npm install -g grunt-cli
npm install -g bower
```

To run the unit tests you need to install mocha

```
npm install -g mocha
```


### Install ClimbingComp Software
Clone the ClimbingComp project from github or download and extract the zip file.

```
cd <project-folder-root>
npm install
bower install
grunt setup
```

Create the database

```
cd <project-folder-root>
npm run setup
```
Enter the database configuration information when prompted.


### Running ClimbingComp for the first time
Start the ClimbingComp server with all default options

```
cd <project-folder-root>
npm start
```

Then open a browser and go to URL

```
http://localhost:8080/ClimbingComp.html
```

When the database was created a default administrator was created with username admin and password admin.
Click Sign In and enter the username and password. Then click Manager users and change the password and/or
create other users.

There are a few options you can use to start the server for example changing the port number.
For information about the command line options, type: 

```
cd <project-folder-root>
node main.js --help
```

If you want to use SSL

TODO config details needed

```
### Generated private key
$ cd ssl
$ openssl genrsa 1024 > key.pem
### Generate self signed cert
$ openssl req -x509 -new -key key.pem > key-cert.pem
```


## Using ClimbingComp to score a competition

Work in progress

### Preparation

TBD

### Creating users

When ClimbingComp is first installed a default admin user is created. You can create additional users and give them
appropriate roles to control what they can do. You should change the password of the default admin user.

You can create a user for yourself with Administrator role or you can continue to use the default admin user. 
Only administrators can manage users and only administrators can define climbing competition events. 

Before or even on the day of the competition you will recruit people to help enter scorecards. Depending on how
many competitors you have 2 to 5 people should be sufficient. You should create a user for each of them with 
role Scorecard Entry. People with the scorecard entry role can only enter or update score cards and view results.
They cannot modify event, route or climber data. You could have all the people doing scorecard entry share
the same username and password but the advantage of using a unique username for each is that the username of the person
that last entered the scorecard is saved so that if any questions of accuracy arise you will know who to talk to.

If you would like to allow people to view the results of the competition you can create a guest user with role 
Read Only Access. Give this user a well known password (such as guest) and let people know about this username 
and password and the URL to ClimbingComp. Then they can connect to it and see the results using their smart phone
or tablet browser. This is completly optional. You don't need to create a guest user.

To create users sign in to ClimbingComp as an admin user. Select Mannager Users. Press Create User.
Enter a Username. First Name and Last Name are optional. Select the appropriate Role. Enter and confirm the 
password. To edit a user press their name. To delete a user press the X under the Actions column.

### Populating the global list of climbers
xxx what, why, optional

When you receive the USA Climbing spreadsheet open it and select the USAC Members tab and save it as a CSV file.
Use UTF-8 for the encoding, comma (,) for the field separator, and double quote (") for the text delimiter.
The spreadsheet has had slightly different formats each year. In 2015/2016 the spreadsheet for the ABS comps
contained these columns in this order:

```
Member No.,First Name,Last Name,Birthdate,Gender,Category,Team Name, Region
```

Sign in to ClimbingComp as an admin user. Select Manage Climbers. Press Import Climbers. Choose the file you
just saved. Unless you deleted the header row from the CSV file leave CSV file has header row set to yes. 
Select the date format; this years date format is Month Day Year with a 2 digit year. In previous years a 4 digit
year was used but either will work. Choose the correct field corresponding to each column in the CSV file.

Chose an Action
 * Add new - this means that only rows in the import file that are not already in the ClimbingComp database will be 
added. Detecting if the climbier is in the database is done by matching the Member Number. Use this choice the 
first time you import since all the climbers will be new.
 * Add new and update existing - this means that in addition to adding new climbers, if the information such
as team or region has changed for an exiting user the changes will be updated.
 * Replace all - this will first delete all the climbers and then add climbers from the import file. Warning! don't
 do this after you have created an event and added climbers because it will delete all those climbers as well. Yes 
 this is a big problem TODO fix it at a minimum display a warning dialog.
 * Test - this will not add or update anything. Use this to check the import file for errors.

Press Upload button. 

The import results are displayed showing how many climbers were added or updated. Any errors are warnings are listed.
It is not uncommon for the USA Climbing spreadsheet to have errors such as duplicate entries for climbers.
If there are errors you can press the show as CSV link and then copy and paste the error rows into a text file, 
correct the errors and then import that file.

After reviewing the results press OK button.

If all goes well the Manage Climbers page will list all the climbers. Scroll to the bottom to see the total.
You can filter the list by Gender and Category and/or Region.

### Create an Event

TODO

### Define the Event Routes

### Add Climbers 

### Network considerations

TBD

## Contributors
* John Snyders
* Matt Ornes

## Contributing

Let me know if you are interested in contributing.
