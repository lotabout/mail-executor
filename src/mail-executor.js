var fs = require('fs');
var path = require('path');
var sp = require('child_process');

//==============================================================================
// Configuration
var config = {
    mail_dir: './mail/Pending/cur',
    mail_done_dir: './mail/Ended/cur',
    default_header: {type: 'download', dir: './output'},
    max_concurrent: 2,
};

//
//==============================================================================
// Monitor: monitor the mail changes, and send the new file name to JobFactory
function Monitor(directory, timeout) {
    this.self = this;
    this.dir = directory;
    this._files = [];
    this._timeout = 120000;
}

Monitor.prototype._get_new_files = function() {
    var cur_files = ls_files(this.dir);
    var new_files = difference(cur_files, this._files);
    this._files = cur_files;
    return new_files;
};

Monitor.prototype._handle_new_file = function(callback) {
    var self = this;
    return function() {};
};

Monitor.prototype.watch = function (callback) {
    var self = this;
    this.timeout_obj = setTimeout(function () {
        var new_files = self._get_new_files();
        if (new_files.length > 0) {
            callback(new_files);
        }

        // reset the timeout
        self.watch(callback);
    }, this._timeout);
};

Monitor.prototype.stop = function() {
    if (this.timeout_obj) {
        clearTimeout(this.timeout_obj);
        this.timeout_obj = undefined;
    }
};

//==============================================================================
// Parser: parse the mail content for later use

//var MailParser = require('mailparser').MailParser;

function Parser() {
}

// split the content into records(not continuous lines as separator)
Parser.prototype.parse_content = function (content) {
    return content.split(/(?:\r?\n)(?:[ \r\t\f]*\n)+/);
};

Parser.prototype.parse_header = function(header) {
    var ret = {};

    var components = header.split(/\s*,\s*/);
    for (var i = 0, len = components.length; i < len; i++) {
        var key_val = components[i].split(/\s*:\s*/);
        if (key_val.length >= 2) {
            ret[key_val[0]] = key_val[1];
        } else if (key_val.length == 1) {
            ret[key_val[0]] = true;
        }
    }

    return ret;
};

// records starts with an optional configuration line (starts with '#')
Parser.prototype.parse_record = function(rec) {
    var record = rec.trim();

    var header = clone(config.default_header);
    var params = record;

    if (record[0] == '#' ) {

        // This is a configuration line
        var end_pos = record.indexOf('\n');
        end_pos = end_pos > 0 ? end_pos : record.length;

        var new_header = this.parse_header(record.substring(1, end_pos));
        extend(header, new_header);
        params = record.substring(end_pos + 1);
    }

    return [header, params];
};

Parser.prototype.content_to_task = function(content) {
    var tasks = [];

    var records = this.parse_content(content);
    for (var i = 0, len = records.length; i < len; i++) {
        var record = records[i];
        var header_param = this.parse_record(record);
        var task = new Task();
        task.header = header_param[0];
        task.params = header_param[1];
        tasks.push(task);
    }
    return tasks;
};

//var sample_mail = "www.baidu.com\nwww.abc.com\n\n#type: bilibili, dir : output/dir\nwww.bilibili.com/videos/2\nwww.bilibili.com/videos/1\n"
//x = new Parser();
//console.log(x.content_to_task(sample_mail));

//==============================================================================
// JobFactory: take a mail and generate a job for running, will need to parse.

function JobFactory() {
}

//==============================================================================
// Goal: a job may have several goals, a goal may contain many tasks

//==============================================================================
// Task: the actual object for execution.

function Task(command) {
    this.cmd = command;

    this.deferred = new Deferred();
    this.promise = this.deferred.promise;
}

Task.prototype.on_exit = function (error, stdout, stderr) {
    // resolve the promise

    this.deferred.resolve(error);
};

//------------------------------------------------------------------------------ 
// Sub task: download
function TaskDownload(URL) {

}

//==============================================================================
// Scheduler: schedule the executors. like limit the maximal executor number

function Scheduler() {
    this.tasks = [];
    this.current_running = 0;
    this.enabled = false;
    this.running = {};
}

Scheduler.prototype.submit = function () {
    for (var i = 0, len = arguments.length; i < len; i++) {
        this.tasks.push(arguments[i]);
    }

    if (this.enabled) {
        this._process_next();
    }
};

Scheduler.prototype._run_task = function(task) {
    var scheduler = this;
    this.current_running ++;

    task.process = sp.exec(task.cmd, function(error, stdout, stderr) {
        // handle the scheduler related ends.
        scheduler.current_running--;
        scheduler._process_next();

        var pid = [task.process.pid];
        if (scheduler.running[pid] !== undefined) {
            delete scheduler.running[pid];
        }

        // call task's callback
        if ('on_exit' in task) {
            task.on_exit(error, stdout, stderr);
        }
    });

    this.running[task.process.pid] = task;
};

Scheduler.prototype._process_next = function() {
    if (!this.enabled || this.current_running >= config.max_concurrent) {
        return;
    }

    var spare_number = config.max_concurrent - this.current_running;

    while (this.tasks.length > 0 && spare_number > 0) {
        // take out a task and run
        this._run_task(this.tasks.shift());
        spare_number --;
    }
};

Scheduler.prototype.start = function() {
    this.enabled = true;
    this._process_next();
};

Scheduler.prototype.stop = function() {
    this.enabled = false;
};

// Test case

//task1 = {cmd: 'sleep 100', on_exit: function() {console.log("task 1");}};
//task2 = {cmd: 'exit 0', on_exit: function() {console.log("task 2");}};
//task3 = {cmd: 'sleep 3', on_exit: function() {console.log("task 3");}};

//s = new Scheduler();
//s.submit(task1, task2, task3);
//s.start();

//==============================================================================
// Helper Functions

// obj1 and obj2 are treated as set, and return obj1-obj2
// no optimization at all
function difference(a, b) {
    var ret = [];
    for (var i = 0, len = a.length; i < len; i++) {
        if (b.indexOf(a[i]) < 0) {
            ret.push(a[i]);
        }
    }

    return ret;
}

// get the files of a directory (non-recursive)
function ls_files(dir) {
    var files = fs.readdirSync(dir);
    return files.filter(function (f) {
        try {
            return fs.statSync(path.join(dir, f)).isFile();
        } catch (e) {
            return false;
        }
    });
}

function bind(obj, method) {
    return function() {
        obj[method].apply(obj, arguments);
    };
}

function allKeys(obj) {
    var keys = [];
    for (var key in obj) {
        keys.push(key);
    }
    return keys;
}

function clone(obj) {
    return Array.isArray(obj) ? obj.slice() : extend({}, obj);
}

function extend(obj, source) {
    var keys = allKeys(source);
    for (var i = 0, len = keys.length; i < len; i++) {
        var key = keys[i];
        obj[key] = source[key];
    }
    return obj;
}

// cause I want to pass the resolve/reject to other place, so `new Promise` do
// not suit well
function Deferred() {
    this.resolve = null;
    this.reject = null;

    this.promise = new Promise(function(resolve, reject){
        this.resolve = resolve;
        this.reject = reject;
    }).bind(this);
}
