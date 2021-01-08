/* NODE internal */
import HTTP        from 'http'
import HTTPS       from 'https'

/* NPM Third Party */
import EXPRESS     from 'express'
import PROGRAM     from 'commander'
import _           from 'lodash'
import BODYPARSER  from 'body-parser'
import Q           from 'q'

/* NPM Paytm*/
import L                from 'lgr'
import SQLWRAP          from 'sqlwrap'
import ELASTICSEARCH    from 'elasticsearch'
import INFRAUTILS       from 'infra-utils'

/* Project Files */
import PROC             from './lib/ptm_proc'
import CONTROLLERS      from './controllers'
import ROUTER           from './routes'
import SERVICES         from './services'
import CRONS            from './crons'
import config           from './config'
import LOCALISATION_CLIENT from 'localisation-client'
import LIB              from './lib'

/* To find memory leak */
// import heapdump         from 'heapdump'

/* Global Variables */
let PORT        = _.get(process,'env.PORT',7000)  //default port 7000
let dbInstance  = new SQLWRAP(config.SQLWRAP)
let esInstance  = new ELASTICSEARCH.Client({
  apiVersion : '0.90',
  host       : config.ELASTICSEARCH.ES_URL_NEW,
  log        : 'error'
})
let mongoDbInstance = new INFRAUTILS.mongo(config.MONGO.MASTER);


let options = {
    L,
    config,
    dbInstance,
    esInstance,
    mongoDbInstance,
    INFRAUTILS,
    LOCALISATION_CLIENT
    },
    deferred = Q.defer();

/*
    Command Line arguments
*/

PROGRAM
    .option('-v, --verbose', 'Run in verbose mode')
    .option('-s, --subscriberMode', 'Run as Subscriber')
    .option('-r, --notify [item(s)]', 'Run as notification service',function(v,m) { m.push(v); return m; }, [])
    .option('-t, --statusReport', 'Status report cron')
    .option('-d, --notificationStatus', 'notification status service')
    .option('-h, --billReminderNotification [billReminderNotification(s)]', 'bill reminder notification cron', function(v, m) { m.push(v); return m; }, [])
    .option('-b, --batch [batch(s)]', 'Run Multiple operators with one publisher', function(v, m) { m.push(v); return m; }, [])
    .option('-p, --planValidityNotification', 'plan validity notification cron')
    .option('-m, --rechargeNudgeRechargeConsumer', 'Recharge nudge consumer for processing recharge data')
    .option('-c, --rechargeNudgeValidationConsumer [mode]', 'Recharge nudge consumer for processing validation data and sending notification. Mode can be d or d+2')
    .option('-i, --recentBills', 'Service to sync bills data')
    .option('-j, --notificationService', 'Service to manage notification')
    .option('-o, --notificationReport', 'sends notification report daily')
    .option('-f, --syncReminder', 'sync reminder with automatic flag')
    .parse(process.argv);

    /*
        setting log level as verbose
    */
    if(PROGRAM.verbose){
        L.setLevel('verbose');
    }

    Q(undefined)
     .then(function(){
         /*load rule-engine config*/
         let ruleEngineInstance = new SERVICES.ruleEngine(options);
         return ruleEngineInstance.fetchOperatorGwMapFromRuleEngine(options);
     })
     .then(function(){
        let cvrDataLoader = new SERVICES.cvrDataLoader(options);
        return cvrDataLoader.start();
    })
    .then(function(){
        // waiting for active pid map to load
        options.activePidLib = new LIB.ActivePID(options);
        return options.activePidLib.load();
    })
    .then(function(){
        L.log('Loading dynamic config');
        let dynamicConfigLib = new LIB.DigitalReminderConfigLib(options);
        return dynamicConfigLib.load();
    })
    .then(function(){

    if(PROGRAM.subscriberMode) {
        L.info('Subscriber mode enabled ... ')
        let serviceInstance = null;
        try {
            mongoDbInstance.connect(function(err,res){
                if(err){
                    L.critical('Unable to connect to Mongo DB for Subscriber Mode... ',err );
                } else {
                    L.log('Connected to Mongo DB successfully for Subscriber Mode... ');
                }
                serviceInstance = new SERVICES.billSubscriber(options);
                serviceInstance.start();
            });
        } catch (ex) {
            L.critical("Exception occured in Subscriber Mode... ",ex);
            serviceInstance = new SERVICES.billSubscriber(options);
            serviceInstance.start();
        }

        process.addListener('SIGUSR2', function(){
            serviceInstance.suspendOperations();
        });

    }
    else if(PROGRAM.batch && PROGRAM.batch.length > 0) {
        L.info('Publisher mode enabled ... ')

        try {
            mongoDbInstance.connect(function(err){
                if(err){
                    L.critical('Unable to connect to Mongo DB for Publisher Mode... ',err );
                } else {
                    L.log('Connected to Mongo DB successfully for Publisher Mode... ');
                    let publisherManager = new SERVICES.publisherManager(options)
                    let operators        = _.get(config, 'PUBLISHER_CONFIG.'+PROGRAM.batch[0], [])
                    L.log('Running for operators: ', operators)
                    operators.forEach(operator => {
                        let tableName = _.get(config, ['OPERATOR_TABLE_REGISTRY', operator], null)
                        if(tableName && publisherManager.createPublisherForOperator(tableName,operator)) {
                            publisherManager.startPublisherForOperator(operator)
                        }
                        else {
                            L.error('No table configured for the operator: ', operator);
                        }
                    })
                }
            });
        } catch (ex) {
            L.critical("Exception occured in Publisher Mode... ",ex);
        }
    }
    else if(PROGRAM.notify && PROGRAM.notify.length > 0) {
        L.info('Notification mode enabled ... ')
        let params = PROGRAM.notify[0].split(',');
        options['categoryId' ] = parseInt(params[0]);
        options['tps'] = parseInt(params[1]);
        let serviceInstance = new SERVICES.notify(options);
        serviceInstance.start();
    }
    else if(PROGRAM.statusReport) {
        L.log('Starting Daily status report sender...')
        CRONS.DailyReporter.exec(options, ()=> {
            L.log('DailyReporter finished its work beautifully, closing sql connection')
            dbInstance.close(function(err){
                if(err) {
                    L.log('Error while closing db connection');
                }
                L.log('Terminating cron')
                process.exit(0)
            });
        })
    }
    else if(PROGRAM.notificationReport) {
        L.log('Starting Daily notifications status report sender...')
        CRONS.NotificationReport.exec(options, ()=> {
            L.log('NotificationReport finished its work beautifully')
            dbInstance.close(function(err){
                if(err) {
                    L.log('Error while closing db connection');
                }
                L.log('Terminating cron')
                process.exit(0)
            });
        })
    }
    else if(PROGRAM.notificationStatus) {
        L.log('Getting notifications status...');
        let serviceInstance = new SERVICES.notificationStatus(options);
        serviceInstance.start();
    }
    else if(PROGRAM.billReminderNotification && PROGRAM.billReminderNotification.length > 0) {
        L.log('Sending bill reminder notifications...', PROGRAM.billReminderNotification);
        options.runMode = PROGRAM.billReminderNotification[0]
        let serviceInstance = new SERVICES.billReminderNotification(options);
        serviceInstance.start();
    }
    else if(PROGRAM.planValidityNotification) {
        L.log('Sending plan validity notifications...');
        let serviceInstance = new SERVICES.planValidityNotification(options);
        serviceInstance.start();
    }
    else if(PROGRAM.rechargeNudgeRechargeConsumer){
        L.log("Starting recharge nudge consumer service to process recharge data");
        let instance = new CRONS.RechargeNudgeRechargeConsumer(options);
        instance.start();
    }
    else if(PROGRAM.rechargeNudgeValidationConsumer){
        L.log("Starting recharge nudge consumer cron to process validation data and send notification");
        // setting mode for which consumer is to be started
        options.mode = PROGRAM.rechargeNudgeValidationConsumer
        let instance = new CRONS.RechargeNudgeValidationConsumer(options);
        instance.start();
    }
    else if(PROGRAM.recentBills) {
        let serviceInstance = new SERVICES.recentBills(options);
        L.log('Starting recent Bills data Service');

        try {
            mongoDbInstance.connect(function(err,res){
                if(err){
                    L.critical('Unable to connect to Mongo DB for recent bills Mode... ',err );
                } else {
                    L.log('Connected to Mongo DB successfully for recent bills Mode... ');
                }
                serviceInstance.start();
            });
        } catch (ex) {
            L.critical("Exception occured in recent bills Mode... ",ex);
            serviceInstance.start();
        }
    }
    else if(PROGRAM.syncReminder) {
        let serviceInstance = new SERVICES.reminderSync(options);
        L.log('Starting reminder sync Service');

        try {
            serviceInstance.start();
        } catch (ex) {
            L.critical("Exception occured in sync reminder Mode... ",ex);
            serviceInstance.start();
        }
    }
    else if(PROGRAM.notificationService){
            let serviceInstance = new SERVICES.notificationService(options);
            L.log('Starting notification service to manage notification...');
            serviceInstance.start();
    }
    else {  //Starting as a web-api server
        L.info('Started as a API Server...');
        let APP     = EXPRESS();

        /*
            Initiating controller's object
        */
        let CONTROLLER_OBJECT = new CONTROLLERS (options);

        /*
            Setting http and https hits' pool size
        */
        _.set(HTTP,'globalAgent.maxSockets',5000);
        _.set(HTTPS,'globalAgent.maxSockets',5000);

        APP.use(BODYPARSER.json({limit: '100mb'}));
        APP.use(BODYPARSER.urlencoded({ extended: false }));
        APP.use(EXPRESS.static('public'));

        try{
            mongoDbInstance.connect(function(err,res){
                if(err){
                    L.critical('Unable to connect to Mongo DB for Digital Reminder System... ',err );
                } else {
                    L.log('Connected to Mongo DB successfully for Digital Reminder System... ');
                }
                /*
                    creating the web server
                */
                HTTP.createServer(APP)
                .on('error',function(error){
                    L.critical('Error in creating HTTP Server', error);
                    process.exit(1);
                })
                .listen(PORT, function(){
                    L.info('Digital Reminder System listening on port - ', PORT);
                });
            });
        } catch(ex) {
            L.error('Exception Occured while connecting to Mongo DB for Digital Reminder System... ',ex );
            HTTP.createServer(APP)
            .on('error',function(error){
                L.critical('Error in creating HTTP Server', error);
                process.exit(1);
            })
            .listen(PORT, function(){
                L.info('Digital Reminder System listening on port - ', PORT);
            });
        }



        //Initialize Router and bind our app with various routes
        let router = new ROUTER(APP, {controller:CONTROLLER_OBJECT});
        router.bindRoutes();
    }
    deferred.resolve();
    return deferred.promise;
});

