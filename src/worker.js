/*jshint node: true */

'use strict';

var errors = [],
    warnings = [];

if (process.argv.length !== 3) {
  errors.push('Missing argument for worker id.');
}

if (process.env.REDIS_PORT === undefined) {
  warnings.push('Environment variable REDIS_PORT missing');
}

if (process.env.REDIS_HOST === undefined) {
  warnings.push('Environment variable REDIS_HOST missing');
}


if (warnings.length > 0) {
  for (var i = warnings.length - 1; i >= 0; i--) {
    console.warn('Warning: ' + warnings[i]);
  }
}

if (errors.length > 0) {
  for (var i = errors.length - 1; i >= 0; i--) {
    console.error('Error: ' + errors[i]);
  }
  process.exit(1);
}


var eventEmitter = require('events').EventEmitter,
    fs = require('fs'),
    workerEmitter = new eventEmitter(),
    handlerEmitter = new eventEmitter(),
    redis = require("redis"),
    work_queue = 'work',
    error_queue = 'error',
    skipped_queue = 'skipped',
    workerid = process.argv[2],
    processing_queue = workerid + '-queue',
    exiting = false,
    canExit = true;


var client = process.env.REDIS_PORT && process.env.REDIS_HOST ?
    redis.createClient(process.env.REDIS_PORT, process.env.REDIS_HOST) :
    redis.createClient();


process.on('SIGINT', function() {
  if (exiting || canExit) process.exit(0); // If pressed twice.
  console.log('Received SIGINT.  Please wait until the current task is finished. Or one more to force exit.');
  exiting = true;
});


// Setting up all the handlers
var walk = function (path) {
  fs.readdirSync(path).forEach(function(file) {
    var fullPath = path + '/' + file;
    var stat = fs.statSync(fullPath);
    if (stat.isFile() && /(.*)\.(js$)/.test(file)) {
      require(fullPath)(handlerEmitter, client);
    }
  });
};
walk(__dirname + '/handlers');


// Setting up the worker logic
workerEmitter.on('start', nextTask);
workerEmitter.on('task_found', processTask);
workerEmitter.on('task_processed', removeTask);
workerEmitter.on('task_finished', nextTask);
workerEmitter.on('task_skipped', pushTask);



console.log('Starting worker ' + workerid);
workerEmitter.emit('start'); // Start



function nextTask () {
  client.LRANGE (processing_queue, 0, 0, function (err, tasks) {
    if ( tasks.length > 0 ) {
      canExit = false;
      console.log('Resumed task: ' + tasks[0]);
      workerEmitter.emit('task_found', tasks[0]);
    } else if (exiting) {
      console.log('Exiting.');
      process.exit(0);
    } else {
      console.log('Wating for new task on ' + work_queue);
      canExit = true;
      client.BRPOPLPUSH (work_queue, processing_queue, 0, function (err, task) {
        canExit = false;
        if (task) { // In case timeout is set to a value
          console.log('Picked task: ' + task);
          workerEmitter.emit('task_found', task);
        }
      });
    }
  });
}


function processTask (task) {
  var task_handle_event = task.substring(0, task.indexOf(':',0));
  console.log('Processing task: ' + task + ' (type ' + task_handle_event + ')');

  var activeHandlersCount = eventEmitter.listenerCount(handlerEmitter, task_handle_event);

  if (activeHandlersCount > 0) {
    var completedHandlersCount = 0;

    handlerEmitter.emit(task_handle_event, task, function () {
      ++completedHandlersCount;
      if (completedHandlersCount === activeHandlersCount) {
        workerEmitter.emit('task_processed', task);
      }
    });
  } else {
    workerEmitter.emit('task_skipped', task);
  }
}

function pushTask (task) {
  client.LPUSH (skipped_queue, task, function (err, result) {
    if (err) {
      throw new Error('Error when LREM from processing_queue ' + processing_queue + ': ' + err);
    } else {
      console.log('Skipped task: ' + task);
      workerEmitter.emit('task_processed', task);
    }
  });
}

function handleError (task) {
  // Not implementet
}

function removeTask (task) {
  client.LREM (processing_queue, -1, task, function (err, result) {
    if (err) {
      throw new Error('Error when LREM from processing_queue ' + processing_queue + ': ' + err);
    } else {
      console.log('Finished task: ' + task);
      workerEmitter.emit('task_finished');
    }
  });
}
