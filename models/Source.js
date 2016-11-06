var debug = require('debug')('snowstreams:model:source');
var keystone = require('keystone');
var Types = keystone.Field.Types;
var async = require('async');
var _ = require('lodash');
var glob = require("glob");
var ss = require('../snowstreams');

/**
 * Source Model
 * ==========
 */

var Source = new keystone.List('Source', {
	autokey: { path: 'slug', from: 'name', unique: true },
	track: true,
	drilldown: 'source program argument'
});

Source.add({
	name: { type: Types.Text, required: true, initial:true, unique: true },
	categories: { type: Types.Relationship, ref: 'SourceCategory', many: true },
	pid: {type: Types.Number, index:true, initial:true, noedit: true  },
	_default: { type: Types.Boolean, default: false },
	type: { type: Types.Select,  label:'type', initial:true,  options: 'file, stream, program, udp',},
},	{ heading: "Stream", dependsOn: { type: 'stream' }, note: 'Can be any acceptable ffmpeg input for video or stream for audio'  }, {
	input: { type: Types.Text, initial: true, dependsOn: { type:'stream' } },
	streamOptions: {
		input: { type: Types.TextArray,  initial: false, dependsOn: {type:'stream'}  },
		output: { type: Types.TextArray,  initial: false, dependsOn: {type:'stream'}  },
		format: { type: Types.Text,  initial: false, dependsOn: {type:'stream'}  },
		only:  { type: Types.Boolean, default: false, dependsOn: {type:'stream'} },
		onlyOptions: { type: Types.TextArray,  initial: false, dependsOn: {type:'stream'}  },
		passthrough:  { type: Types.Boolean, default: false, dependsOn: {type:'stream'} },
	},
},	{ heading: "UDP", dependsOn: { type: 'udp' } }, {
	host: { type: Types.Text,  label:'host', initial: true, dependsOn: { type:'udp' } },
	port: {type: Types.Number, index:true, initial: true, dependsOn: { type:'udp' }  },
	source: { type: Types.Boolean, default: false, initial: true , dependsOn: { type:'udp' } },
},	{ heading: "Program", dependsOn: { type: 'program' } }, {
	program: { type: Types.Relationship, ref: 'Program', many: false, dependsOn: {type:'program'} },
	argument: { type: Types.Relationship, ref: 'ProgramArgument', many: false, dependsOn: {type:'program'} },
	command: { type: Types.Text, noedit: true, dependsOn: {type:'program'} },
	source: { type: Types.Relationship, ref: 'Source', many: true , dependsOn: {type:'program'} },
	respawn: { type: Types.Boolean, default: false, initial:true , dependsOn: {type:'program'} },
	restarts: { type: Types.Number, default: 10, initial:true, dependsOn: {respawn:true, type:'program'}  },
	sleep: { type: Types.Number, default: 1000, initial:true, dependsOn: {respawn:true, type:'program'}  },
	kill: { type: Types.Number, default: 30000, initial:true, dependsOn: {respawn:true, type:'program'}  },
},	{ heading: "File", dependsOn: { type: 'file' } }, {
	file: { type: Types.Text,  initial:true, dependsOn: {type:'file'}  },
	directory: { type: Types.Boolean, default: false, initial:true, dependsOn: {type:'file'}  },
	ext: { type: Types.Text,  initial:true, dependsOn: {directory: true, type: 'file'}  },
	files: { hidden: true, type: Types.Relationship, ref: 'File', many: true , dependsOn: {type:'file'} },
	scan: { type: Types.Boolean, default: false, dependsOn: {type:'file'} },
	fileOptions: {
		input: { type: Types.TextArray,  initial: false, dependsOn: {type:'file'}  },
		output: { type: Types.TextArray,  initial: false, dependsOn: {type:'file'}  },
		format: { type: Types.Text,  initial: false, dependsOn: {type:'file'}  },
		only:  { type: Types.Boolean, default: false, dependsOn: {type:'file'} },
		onlyOptions: { type: Types.TextArray,  initial: false, dependsOn: {type:'file'}  },
		passthrough:  { type: Types.Boolean, default: false, dependsOn: {type:'file'} },
	},
}, 'Track', {	
	streaming: { type: Types.Boolean, default: false, initial:true, noedit: true },
	broadcast: { type: Types.Boolean, default: false, initial:true, noedit: true },
	expose: { type: Types.Boolean, default: false, initial:true }

});

Source.schema.post('remove', function(doc) {
	keystone.list('File').model.update({}, { $pull :  {'source' : doc._id } }, {multi: true}, function(err){
			debug(err,'removed source from files');
	}); 
});

Source.schema.pre('save', function(go) {
	var doc = this;
	
	async.series([function(next) {
		
		if(doc.argument) {
			keystone.list('ProgramArgument').model.findOne({_id: doc.argument}).populate('program').exec(function(err, argss) {
				if(err) next();
				if(!argss) next();
				//debug(argss, argss.program)
				doc.command = argss.program.program + ' ' + argss.argument;
				next();
			});
		} else {
			next();
		}
	}],function(err) {
		go();
	});
});
 
Source.schema.post('save', function() {
	var doc = this;

	var doScan = doc.scan;
	
	async.series([function(next) {
		//debug('post save source');
		if(doScan && doc.type === 'file' && doc.file) {
			if(!doc.directory) {
				debug('single file');
				pushFile(doc,{ file: doc.file, options: doc.fileOptions }, next)
				ss.talk('Source-log', { message: doc.file});
				next();
			} else {
				debug('multiple files');
				// check the filters
				if(doc.ext) {
					var ext = doc.ext.replace(/ /g, ',');
					var pattern = _.endsWith(doc.file, '/') ? doc.file : doc.file + '/';
					pattern += '**/*.{' + ext + '}';
					pattern += '*';
					var matched = 0;
					var num = 1;
					var cargo = async.cargo(function (files, callback) {
						for(var i=0; i<files.length; i++){
							pushFile(doc, { file: files[i], options: doc.fileOptions });
						}
						callback();
					}, 30);
					var gg = glob(pattern, {}).
						on('match', function(file) {
							matched++;
							cargo.push(file, function (err) {
								ss.talk('Source-log', { message: num++ + ' :: ' + file});
							});
						}).
						on('end', function(files) {
							debug('end glob');
							ss.talk('Source-log', { message: ' Total Files :: ' + files.length});
						});
					next();
					
				} else {
					next();
				}
			}
		} else {
			next();
		}
	}],function(err) {
		// reset scan
		doc.update({ scan: false}, function(err,doc){});
	});
});

Source.relationship({ ref: 'File', path: 'source' });
Source.defaultColumns = 'name, type|20%, streaming|20%, pid|20%';
Source.register();

function pushFile(doc, file, cb) {
	if(!_.isFunction(cb)) {
		cb = function(){};
	}
	// just push the file
	var send ={
		"$set": file,
		"$addToSet": {source: doc._id}
	};
	var list = keystone.list('File');
	list.model.findOneAndUpdate({ file: file.file  }, send, {upsert: true, safe: true}, function(err, newdoc){
		if(err) {
			ss.talk('log:error', { location: 'Model:Source:151', error: err});
			ss.talk('Source-log', { location: 'Model:Source:152', error: err});			
			return cb(err);
		}
		if(newdoc) {
			debug('pushed file ' + file);
			list.model.addCodec(newdoc, true);
			doc.update({"$addToSet": { files: newdoc._id } }, function(err,ret) {});
		} else {
			ss.talk('log:error', { location: 'Model:Source:89', error: 'Doc not created', doc: newdoc});
			debug('newdoc not created', newdoc);
		}		
	});
}