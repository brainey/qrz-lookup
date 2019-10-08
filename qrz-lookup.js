#!/usr/bin/env node

'use strict';

//const [,, ... args] = process.argv

const yargs = require('yargs');
const axios = require('axios');
const xml2js = require('xml2js');
const fs = require('fs');

const parser = xml2js.Parser({ explicitArray: false});

const login = async (username, password) => {
    var login_req = {
        method: 'get',
        url: 'https://xmldata.qrz.com/xml/current/',
        params: {
            username: username,
            password: password,
        }
    };

    try {
        var res = await axios.request(login_req);
        return res;
    } catch (error) {
        console.error(error);
    }
}

const query = async (callsign, key) => {
    var callsign_req = {
        method: 'get',
        url: 'https://xmldata.qrz.com/xml/current/',
        params: {
            s: key,
            callsign: callsign
        }
    };

    try {
        var res = await axios.request(callsign_req);
        return res;
    } catch (error) {
        console.error(error);
    }
}

const lookup = async (args, cb) => {
    try {

        const login_res = await login(args.username, args.password);
        //if (argv.count > 1) console.log('login response:', login_res.data);
        if (login_res.data) {
            parser.parseString(login_res.data, async (err, result) => {
                if (args.verbose > 1) console.log(JSON.stringify(result, null, 2));
                fs.writeFileSync('qrz-session.json', JSON.stringify(result.QRZDatabase.Session,null,2));
                var key = result.QRZDatabase.Session.Key;
                if (args.verbose > 1) console.log('Key:', key);
                try {
                    var callsign_res = await query(args.callsign, key);
                    if (callsign_res.data) {
                        cb(null, callsign_res.data);
                    } else {
                        cb('no data', null);
                    }
                } catch (error) {
                    console.error(error);
                }
            });
        }
    } catch (error) {
        console.error(error);
    }
}

const argv = yargs
      .command('$0 <callsign>', 'lookup callsign on QRZ', (yargs) => {   // default command
        yargs.positional('callsign', {
            describe: 'a US Amateur Radio Callsign',
            type: 'string'
        })
    })
      .option('username', {
        describe: 'Username for QRZ Account',
        type: 'string'
    })
      .option('password', {
        describe: 'Password for QRZ Account',
        type: 'string'
    })
      .option('verbose', {
        describe: 'Increase the verbosity of debug and informational messages',
        count: true
    })
      .option('json', {
        describe: 'Output interesting results in JSON',
        type: 'boolean',
    })
      .demandOption(['username', 'password'], 'Need both username and password for logging into QRZ.')
      .help()
      .argv;

//argv.callsign = argv.callsign.toUpperCase();
if (argv.verbose > 2) console.log(argv);

var class_names = {
    'T': 'technician',
    'G': 'general',
    'E': 'extra',
    'A': 'advanced',
};

var mapToClass = (class_alias) => {
    if (class_alias in class_names) {
        return class_names[class_alias];
    } else {
        return class_alias;
    }
}

const capitalize = (str) => {
    if (typeof str !== 'string') {
        return '';
    }
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

const titleCase = (str) => {
    var splitStr = str.toLowerCase().split(' ');
    for (var i = 0; i < splitStr.length; i++) {
        // You do not need to check if i is larger than splitStr length, as your for does that for you
        // Assign it back to the array
        splitStr[i] = splitStr[i].charAt(0).toUpperCase() + splitStr[i].substring(1);     
    }
    // Directly return the joined string
    return splitStr.join(' '); 
}

const process_callsign = (err, xmldata) => {
    if (err) {
        console.error(err);
    } else {
        parser.parseString(xmldata, (err, result) => {
            if (err) {
                console.error(error);
            } else {
                // data of interest
                // name, address, city, license class, expiration, vanity/normal, previous callsigns, born
                if (result.QRZDatabase.Callsign) {
                    var data = result.QRZDatabase.Callsign;
                    if (argv.verbose > 1) console.log(JSON.stringify(data, null, 2));
                    var parts1 = data.fname.split(' ');
                    var parts2 = data.name.split(', ');
                    var name = {
                        first: capitalize(parts1[0]),
                        middle: parts1[1],
                        last: capitalize(parts2[0]),
                        suffix: parts2[1],
                    };
                    var address = {
                        address: titleCase(data.addr1),
                        city: titleCase(data.addr2),
                        state: data.state,
                        zip: data.zip
                    };
                    var fcc = {
                        callsign: data.call,
                        class: mapToClass(data.class),
                        expires: data.expdate,
                        aliases: data.aliases
                    };
                    var info = {
                        name: name,
                        address: address,
                        fcc: fcc
                    };
                    if (data.born) {
                        info['birthyear'] = data.born;
                    }
                    if (argv.json) {
                        console.log(JSON.stringify(info, null, 2));
                    } else {
                        console.log(fcc.callsign, name.first + ' ' + name.last);
                    }
                } else {
                    if (argv.verbose > 1) console.log(JSON.stringify(result, null, 2));
                    if (result.QRZDatabase && result.QRZDatabase.Session) {
                        console.log(result.QRZDatabase.Session.Error);
                    }
                }
            }
        });
    }
};

lookup(argv, process_callsign);
