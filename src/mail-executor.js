var fs = require('fs');
var path = require('path');

//==============================================================================
// Configuration
var config = {
    mail_dir: './mail/Pending/cur',
    mail_done_dir: './mail/Ended/cur'
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
function Parser() {
}

Parser.prototype.parse_content = function (content) {
    var line_spliter = /
};

var test_mail_1 = "#task:download, dir: SomeWhere\nurl1\nurl2\nurl3\n\nurl1\nurl2\n\n";


//==============================================================================
// JobFactory: take a mail and generate a job for running, will need to parse.

var MailParser = require('mailparser').MailParser;

function JobFactory() {
}



function print(x) {
    console.log(x);
}

var monitor = new Monitor(config.mail_dir);
monitor.watch(print);

//==============================================================================
// Task: A job may contain many tasks, while a task may contain several
// executors
//
//==============================================================================
// Executor, do the actual work
//
//==============================================================================
// Processor: schedule the executors. like limit the maximal executor number
//
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
