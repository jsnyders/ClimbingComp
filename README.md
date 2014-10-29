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

The node package manager (npm) should come bundled with node.js. Two other node tools are needed.
Install grunt and bower globally:

```
npm install -g grunt-cli
npm install -g bower
```


### Install ClimbingComp Software
Clone the ClimbingComp project from github or download and extract the zip file.


```
cd <project-folder-root>
npm install
grunt setup
```

Create the database TODO the following is out of date

```
mysql -u root -p -h localhost
> create user john identified by john;
> create database climbing_comp character set = utf8;
> grant all on climbing_comp.* to john;
-- xxx so triggers can be created is this wise?
> grant super on *.* to john;
> exit
mysql -u john -p -h localhost climbing_comp
> source createdb.sql
>exit
```

Start the server TODO the following is out of date


```
```

If you want to use SSL TODO config details needed

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
