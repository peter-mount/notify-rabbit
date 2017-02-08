/*
 * config.js    Handles our new yaml style configuration
 */

var yaml = require('js-yaml'),
        fs = require('fs'),
        pgp = require('pg-promise')(options),
        promise = require('bluebird'),
        options = {
            // Initialization Options
            promiseLib: promise,
            // global event notification;
            error: function (error, e) {
                if (e.cn) {
                    // A connection-related error;
                    //
                    // Connections are reported back with the password hashed,
                    // for safe errors logging, without exposing passwords.
                    console.log("CN:", e.cn);
                    console.log("EVENT:", error.message || error);
                }
            }
        };

var config = {},
        databases = {};

function $main(options) {

    // Load the config file
    try {
        config = yaml.safeLoad(fs.readFileSync(
                options.config ? options.config : 'config.yaml',
                'utf8'));
    } catch (e) {
        console.error(e);
    }

    // We need the databases loaded
    if (options.databases && config.databases)
        databases = Object.keys(config.databases)
                .reduce(function (a, b) {
                    var c = config.databases[b];
                    if (c.enabled) {
                        a[b] = pgp({
                            host: c.host,
                            port: c.port ? c.port : 5432,
                            database: c.database,
                            user: c.user,
                            password: c.password,
                            ssl: c.ssl ? c.ssl : false
                        });
                    }
                    return a;
                }, {});

    return {
        // Link to the pg-promise databases
        db: databases,
        // Link to the configuraton
        config: config,
        // Link to enable notify code
        notify: notify
    };
}

// =============================================================================

function notify(handlers) {

    if (config.notify) {
        config.notify
                .filter(function (n) {
                    return n.enabled === true;
                })
                .reduce(function (a, n) {
                    var db = databases[n.database];

                    // Add any handlers
                    var actions = n.handlers ? Object.keys(handlers)
                            .filter(function (b) {
                                return n.handlers[b];
                            })
                            .reduce(function (a, b) {
                                // Call the handler with config, listener and the handler's config
                                // expect a function back that accepts the payload or null to ignore
                                var f = handlers[b](config, n, n.handlers[b]);
                                if (f)
                                    a.push(f);
                                return a;
                            }, [])
                            : [];

                    if (actions && actions.length) {
                        db.connect({direct: true})
                                .then(function (sco) {
                                    sco.client.on('notification', function (data) {
                                        try {

                                            // Optional debug, log the message as we receive it
                                            if (n.debug)
                                                console.log('Notify:\t' + Object.keys(data)
                                                        .reduce(function (a, b) {
                                                            a.push([b, data[b]].join(b.length < 8 ? '\t\t' : '\t'));
                                                            return a;
                                                        }, [])
                                                        .join('\n\t'));

                                            // The payload, either string or json as per config
                                            var payload = n.json ? JSON.parse(data.payload) : data.payload;
                                            
                                            actions.forEach(function (f) {
                                                // Try block so an action doesn't cause us to fail
                                                try {
                                                    f(payload);
                                                } catch (e) {
                                                    console.error(e);
                                                }
                                            });

                                        } catch (e) {
                                            console.error(e);
                                        }
                                    });
                                    return sco.none('LISTEN $1~', n.name);
                                })
                                .catch(function (error) {
                                    console.error('Error: ', error);
                                    // Exit the process. In production this will cause docker to restart the entire application
                                    process.exit(1);
                                });
                    }

                    return a;
                }, {});
    }

}

// =============================================================================
module.exports = $main;
//module.exports = {
//    getStatus: getStatus,
//    setFail: setFail,
//    setRun: setRun,
//    setSuccess: setSuccess
//};
