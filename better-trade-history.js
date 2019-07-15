/* BetterTradeHistory
 * what price was bitcoin when I transacted that altcoin
 * (c) 2019 David (daXXog) Volm ><> + + + <><
 * Released under Apache License, Version 2.0:
 * http://www.apache.org/licenses/LICENSE-2.0.html  
 */

/* UMD LOADER: https://github.com/umdjs/umd/blob/master/returnExports.js */
(function (root, factory) {
    if (typeof exports === 'object') {
        // Node. Does not work with strict CommonJS, but
        // only CommonJS-like enviroments that support module.exports,
        // like Node.
        module.exports = factory();
    } else if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define(factory);
    } else {
        // Browser globals (root is window)
        root.BetterTradeHistory = factory();
  }
}(this, function() {
    var BetterTradeHistory;
    
    var ErrorHandler = function(err) {
        if(err) {
            throw(err);
        }
    };

    var userHome = require('user-home'),
        fs = require('fs');

    var opt = require('optimist')
        .alias('e', 'endpoint')
            .describe('e', 'The CoinDesk API endpoint.')
            .default('e', 'http://127.0.0.1:7777/v1/bpi/') //use local endpoint (coindesk-cache) server

        .alias('m', 'mongo')
            .describe('m', 'MongoDB connection url stored in a file.')
            .default('m', userHome + '/Desktop/mongo.txt')

        .alias('o', 'csv')
            .describe('o', 'The file template to use for the CSV outputs.')
            .default('o', userHome + '/Desktop/{{subdir}}/{{sort}}-tradeHistoryBetter.csv')

        .alias('s', 'subdir')
            .describe('s', 'The subdir to use in the template.')
            .default('s', 'tradeHistory')

        .alias('c', 'collection')
            .describe('c', 'The MongoDB collection name.')
            .default('c', 'csv')

        .alias('d', 'delay')
            .describe('d', 'The delay between requests (in milliseconds). Smaller number = faster execution and more crashes.')
            .default('d', 15)

        argv = opt.argv;

        var MongoClient = require('mongodb').MongoClient,
            request = require('request'),
            _ = require('underscore'),
            cSv = require('csv-stringify/lib/sync'),
            sf = require('switch-factory'),
            Mustache = require('mustache');

        var fileSafe = sf.allow('QWERTYUIOPASDFGHJKLZXCVBNMqwertyuiopasdfghjklzxcvbnm1234567890-_');

        var mongoUrl = fs.readFileSync(argv.mongo, 'utf8');

    var csvLine = function(line) {
        return cSv([line]);
    };

    BetterTradeHistory = function() {
        console.log("better tradeHistory.csv !");

        console.log("connecting to database..");

        MongoClient.connect(mongoUrl, { useNewUrlParser: true }, function(err, client) {
            if(!err) {
                var db = client.db();
                console.log("Connected to database: " + db.s.databaseName);

                db.collection(argv.collection, function(err, collection) {
                    if(!err) {
                        collection.countDocuments({}, {}, function(err, count) {
                            var wroteHeader = {};

                            if(!err) {
                                var minLine = 1,
                                    asl = new BetterTradeHistory.AsyncSyncLines(minLine, function(x) {
                                        var y = (function(x) { //advanced map-like function
                                            var header = _.keys(x.doc),
                                                values = _.values(x.doc),
                                                idx = 0;

                                            //remove _id
                                            idx = header.indexOf('_id');
                                            header.splice(idx, 1);
                                            values.splice(idx, 1)

                                            //remove _line
                                            idx = header.indexOf('line');
                                            header.splice(idx, 1);
                                            values.splice(idx, 1)

                                            //add in the BPI
                                            header.push('Coindesk BPI');
                                            values.push(x.btcPrice);

                                            return {
                                                header: header,
                                                values: values,
                                                obj: (function(header, values) {
                                                    var obj = {};

                                                    header.forEach(function(v, i) {
                                                        obj[v] = values[i];
                                                    });

                                                    return obj;
                                                }(header, values))
                                            }
                                        })(x);

                                        var sort = ['Market', 'Type'].map(function(v, i, a) {
                                            return fileSafe(y.obj[v]);
                                        }).join('-');

                                        var fn = Mustache.render(argv.csv, {
                                            sort: sort,
                                            subdir: argv.subdir
                                        });

                                        if(wroteHeader[fn] !== true) {
                                            fs.writeFileSync(fn, csvLine(y.header));
                                            wroteHeader[fn] = true;
                                            console.log('wrote Header to: ' + fn);
                                        }

                                        fs.writeFileSync(fn, csvLine(y.values), {
                                            flag: 'a'
                                        });

                                        if(x.doc.line === count) {
                                            console.log('Got to last line: ' + count);
                                            process.exit();
                                        }
                                    });

                                for(var line = minLine; line <= count;  line++) { //for each line
                                    var query = {
                                        line: line //current line
                                    };

                                    //do an async query on each line
                                    collection.findOne(query, {}, function(err, doc) {
                                        if(!err) {
                                            var date = doc.Date.split(' ')[0];

                                            setTimeout(function() {
                                                request({
                                                        uri: argv.endpoint + "historical/close.json",
                                                        qs: {
                                                            start: date,
                                                            end: date
                                                        }
                                                }, function(err, response, body) {
                                                    if(!err) {
                                                        asl.sync(doc.line, (function(body) {
                                                            return {
                                                                btcPrice: JSON.parse(body).bpi[date],
                                                                doc: doc
                                                            };
                                                        })(body)); //sync back up the lines
                                                    } else {
                                                        ErrorHandler(err);
                                                    }
                                                });
                                            }, doc.line * argv.delay); //delay requests to prevent bugs / crashes
                                        } else {
                                            ErrorHandler(err);
                                        }
                                    });
                                }
                            } else {
                                ErrorHandler(err);
                            }
                        });
                    } else {
                        ErrorHandler(err);
                    }
                });
            } else {
                ErrorHandler(err);
            }
        });
    };

    //tool for syncing back up async out of sync stuff using "lines"
    BetterTradeHistory.AsyncSyncLines = function(minLine, output) {
        this.output = output; //the function to send "payload" to
        this.line = minLine; //the smallest line value to look for
        this.q = {};
    };

    BetterTradeHistory.AsyncSyncLines.prototype.sync = function(line, payload) { //expected to be ran once per "line"
        if(this.line === line) { //look for the line we want to run (so new things can't be run until line++ is called)
            this.output(payload); //run the current line
            this.line++; //safe to execute the next line

            if(typeof this.q[this.line] !== "undefined") { //check the q for the next line
                this.sync(this.line, this.q[this.line]); //if the next line exists we can run it right away!
                delete this.q[this.line]; //clear out the line once we do it
            }
        } else { //the line value is probably in the future, put it in the q
            this.q[line] = payload;
        }
    };

    return BetterTradeHistory;
}));
