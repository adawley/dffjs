#!/bin/node

/**
 *  Traverses a directory structure looking for duplicate files in order:
 *    1. size
 *    2. CRC
 *    3. Hash
 */

/*
    Modules
 */
var _ = require('underscore'),
    async = require('async'),
    crc = require('crc'),
    fs = require('fs'),
    util = require('util');

function DFFile(path, stat){
    var slash_char = path.lastIndexOf('/');

    // +1 to keep the slash
    this.directory = path.slice(0, path.lastIndexOf('/')+1);

    // +1 to remove the slash
    this.filename = path.slice(path.lastIndexOf('/')+1);
    this.fullpath = path;
    this.stat = stat;
}

/**
 * Parse the command line arguments
 *
 *
 */
function parse_arguments() {
    var args = {
        dirs: []
    };
    process.argv.forEach(function(arg, index, array) {
        var stat = fs.statSync(arg);

        if(stat.isDirectory()){
            args.dirs.push(arg);
        }
    });

    return args;
}

function print_duplicates(){
    function prn(str){
        console.log(str); //XXX
    }

    // console.time('print');
    for (var i = duplicate_files.length - 1; i >= 0; i--) {
        _.each(duplicate_files[i], prn);
    }

    // console.timeEnd('print');
    // console.log('Total:', duplicate_files.length); //XXX
}

function get_hash_key(filename){

}

function get_crc_key(filename, fn){
    var max_buffer_size = 1024,
        fd = fs.openSync(filename, 'r'),
        size = fs.fstatSync(fd).size,
        bytes = (size > max_buffer_size) ? max_buffer_size : size,
        buffer = new Buffer(bytes),
        ret;

    // some files dont register a byte so they need a special place otherwise
    // fs.read gets angry
    if(bytes === 0){
        finish(crc.crc32(fs.readFileSync(filename, 'utf8')));
    } else {
        fs.read(fd, buffer, 0, bytes, 0, function(err, bytesRead, buffer){
            finish(crc.crc32(buffer.toString('utf8')));
        });
    }

    function finish(ret){
        if(!!fn){
            fs.closeSync(fd);
            fn(null, ret);
        }
    }

}

function filter_duplicate_files(arr2d, fn){

    var arr, crc, filename,
        buff = {},
        dupes,i;

    // create the duplicate file array
    for (i = arr2d.length - 1; i >= 0; i--) {
        arr = arr2d[i];

        filename = arr[0];
        crc = arr[1];

        // Try to add the crc to the object and if it already exists that means
        // there is a duplicate file.
        if(!!buff[crc]){
            buff[crc].push(filename);
        } else {
            buff[crc] = [filename];
        }

    }

    // clean out any crc's with only 1 file
    dupes = _.reject(buff, function(arr, key){
        return (arr.length == 1);
    });

    if(!!fn){
        fn(null, dupes);
    }

}

/**
 * Readdir wrapper that adds full path and checks for trailing slash.
 * @param  {String}   path The path to the dir to read.
 * @param  {Function} fn   Callback
 * @return {[type]}        [description]
 */
function _readdir(path, fn){
    var last_path_char = path.charAt(path.length-1);

    path = (last_path_char === '/' || last_path_char === '\\') ? path : path+'/';
    fn = fn || function(){};

    fs.readdir(path, function(err, paths){

        for (var i = paths.length - 1; i >= 0; i--) {
            paths[i] = path + paths[i];
        }

        async.map(paths, readdir_fork, function(){
            if(a_dirs.length > 0){
                _readdir(a_dirs.pop(), fn);
            } else {
                fn();
            }
        });
    });

}

function readdir_fork(path, fn){
    fn = fn || function(){};

    fs.stat(path, function(err, stat){
        if(!stat){
            fn();
            return;
        }
        if(stat.isDirectory()){
            a_dirs.push(path);
        } else if(stat.isFile()){
            var file = new DFFile(path, stat);
            a_files.push(file);
        } else {
            console.log('Unknown type:', stat); //XXX
        }

        fn();
    });
}

function get_files(path){
    // console.log('get_files'); //XXX
    var tk = new Tracker();

    _readdir(path, tk.done);

    return tk;
}

function Tracker(){
    var count = 0,
        call_count = 0,
        self = this,
        time = new Date().getTime(),
        ondone = function(){
        console.log(time,'ondone never set.'); //XXX
    };

    // console.log('tracker', time); //XXX

    this.done = function(){
        count++;
        // console.log(count, call_count); //XXX
        if(count >= call_count){
            // console.log('complete', time); //XXX
            process.nextTick(ondone);
            return;
        }
    };

    this.on = function(){

    };

    this.ondone = function(fn){
        ondone = fn;
    };

    this.setCount = function(arg){
        call_count = arg;
    };

    this.then = function(fn){

    };
}


/*
 *  Main
 */
var args = parse_arguments(),
    duplicate_files = [],
    a_files = [],
    a_dirs = [];

if(args.dirs.length >= 1){

    async.series([

            /*
                Create an array of all the files in our search path.
             */
            function(fn){
                // todo scale to multiple dirs
                get_files(args.dirs[0]).ondone(function(){

                    // dont do anything until there are no more directories to be parsed
                    if(a_dirs.length > 0){  return; }

                    // console.log('files:', a_files); //XXX
                    // console.log('dirs:', a_dirs); //XXX
                    // console.log(a_files.length); //XXX

                    fn();
                });
            },

            /*
                Calcualte the CRC of each of the files.
             */
            function(fn){
                async.map(a_files, get_crc_key, function(err, results){
                    var arr = _.zip(a_files,results);
                    a_files = arr;
                    // console.log(arr); //XXX
                    fn();
                });
            },

            /*
                Remove non-duplicates
             */
            function(fn){
                filter_duplicate_files(a_files, function(err, results){
                    duplicate_files = results;
                    fn();
                });
            }
        ],
        print_duplicates);

}
