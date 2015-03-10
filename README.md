# ClimbingComp

ClimbingComp is a rock climbing competition scoring app. It allows multiple people using tablets or laptops
to quickly enter scorecard data so final results can be posted fast.

It is in an early stage of development but has been used successfully at a few climbing competitions in 2014.

The traditional way of scoring a climbing competition relies on using spreadsheet software. This creates a data
entry bottleneck where only one person at a time can enter data. Even when the data entry is divided between
multiple people there is extra overhead in partitioning the scorecards and consolidating the results.
In addition spreadsheet software is not optimized for rapid scorecard entry.

ClimbingComp is designed to address the inherent problems with using a spreadsheet. ClimbingComp is a web application
so it can be used by many people at once, All the data is stored centrally. The UI is optimized for competition
scorecard data entry making it faster and reducing errors.

It is designed based on the USA Climbing climbing competition format and scoring rules but may be applicable, or
adapted to other situations.

Currently it only handles Red Point format comps.

Source: [https://github.com/jsnyders/ClimbingComp](https://github.com/jsnyders/ClimbingComp)

## Features

* Its a web app that works on tablets laptops or desktops
* Data entry screen has same layout as scorecard for easy data entry

## License
GNU Affero General Public License. See LICENSE.txt for details.

## Setup
The following steps including installing development tools grunt-cli and bower. In the future the setup steps
will be simplified so that these tools are not needed.

### Install MariaDB

Get the 5.5 series MariaDB software from [https://downloads.mariadb.org](https://downloads.mariadb.org) and follow instructions.

MySQL should also work but this has not been tested.

Test that MariaDB is installed with:

```
mysql --version
mysql -u root -p -h localhost
> exit
```

### Install Node.js
Download and install node.js from [http://nodejs.org/download/](http://nodejs.org/download/)
Add the node bin folder to the PATH and set NODE_PATH.
Test that node is working with:

```
node --version
node
> process.exit();
```

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

Start the server

```
cd <project-folder-root>
npm start
```

TODO more information about other command line options.


Then open a browser and go to URL

```
http://localhost:8080/ClimbingComp.html
```

When the database was created a default administrator was created with username admin and password admin.
Click Sign In and enter the username and password. Then click Manager users and change the password and/or
create other users.

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
TBD

### Preparation

TBD

### Network considerations

TBD

## Contributors
* John Snyders
* Matt Ornes

## Contributing

Let me know if you are interested in contributing.
