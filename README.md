# ClimbingComp

ClimbingComp is a rock climbing competition scoring app. It allows multiple people using tablets or laptops
to quickly enter score card data so final results can be posted fast.

It is in an early stage of development but has been used successfully at two climbing competitions in
the spring of 2014.

The traditional way of scoring a climbing competition relies on using spreadsheet software. This creates a data
entry bottleneck where only one person at a time can enter data. Even when the data entry is divided between
multiple people there is extra overhead in partitioning the score cards and consolidating the results.
In addition spreadsheet software is not optimized for rapid score card entry.

ClimbingComp is designed to address the inherent problems with using a spreadsheet. ClimbingComp is a web application
so it can be used by many people at once, All the data is stored centrally. The UI is optimized for competition
score card data entry making it faster and reducing errors.

It is designed based on the USA Climbing climbing competition format and scoring rules but may be applicable, or
adapted to other situations.

Currently it only handles Red Point format comps.

Source: [https://github.com/jsnyders/ClimbingComp](https://github.com/jsnyders/ClimbingComp)

## Features

* Its a web app that works on tablets laptops or desktops
* Data entry screen has same layout as score card for easy data entry

## License
GNU Affero General Public License. See LICENSE.txt for details.

## Setup

### Install MariaDB

Get the 5.5 series MariaDB software from [https://downloads.mariadb.org](https://downloads.mariadb.org) and follow instructions.

MySQL should also work with minor changes to the database creation script but this has not been tested.

Test that MariaDB is installed with:

```
mysql -u root -p -h localhost
> exit
```

### Install Node.js
Download and install node.js from [http://nodejs.org/download/](http://nodejs.org/download/)
Add the node bin folder to the PATH and set NODE_PATH.
Test that node is working with:

```
node
> process.exit();
```

### Install ClimbingComp Software
TBD

## Using ClimbingComp to score a competition
TBD

### Preparation

### Network considerations


## Contributors
* John Snyders
* Matt Ornes

## Contributing

Let me know if you are interested in contributing.
