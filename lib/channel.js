var	_ = require('lodash');
var	debuger = require('debug')('snowstreams:lib:channel');
var async = require("async");
var hat = require('hat');
var path = require('path');
var fs = require('fs-extra');

module.exports = function(Broadcast) {
	
	function Channel(channel, options) { 
		
		if (!(this instanceof Channel)) return new Channel(channel, options);
		
		if(!_.isObject(options)) {
			options = {};
		}
		var _this = this;
		
		this.debug = options.noDebug ? function(){} : debuger;
		
		this.options = options;
		
		this.debug(channel + ' - ' +'new Channel ', channel);	
		
		//_.defaults(this, options);
		
		this.channel = channel;
		this.name = channel;
		this.state = {
			current: 'construct'
		}	
		
		this.sources = [];
		this._loop = [];
		
		if(options.file) {
			this.sources.push(options.file);
			this._loop.push(options.file);
		}
		
		if(Array.isArray(options.files)) {
			this.sources = options.files;
			this._loop = options.files;
		}
		
		this.noTransition = options.noTransition === true ? true : false;
		this.filler = options.filler || Broadcast.filler;	
		this.transition = false;
		this.currentSource = false;
		this.loop = options.loop;
		
		// an open stream to add our content
		// this broadcast stream should only end with explicit instructions
		this.stream = this.broadcast = Broadcast.Stream.bridge();
		
		// master link
		this.link = 'http://' + Broadcast.host + ':' + Broadcast.port + '/alvin/channel/' + this.channel;
		this.url = '/alvin/channel/' + this.channel;
		// other links
		this.links = {
			local: '/alvin/channel/' + this.channel,
			http: 'http://' + Broadcast.host + ':' + Broadcast.port + '/alvin/channel/' + this.channel,
			hls: [],
			udpSink: [],
			udpStream: []
		};
		this.commands = {
			sockets: options.socketCommands || [],
			request: options.requestCommands || [],
			link: options.linkCommands || []
		};
		
		// start a udp broadcast if requested
		this.udpSink = {};
		this.udpStream = {};
		async.series([
			(next) => {
				if(options.udpSink) {
					var sink = _.isArray(options.udpSink) ? options.udpSink : [options.udpSink];
					async.forEach(sink, (drip, drop) => {
						this.udpSink = new Broadcast.Source.UDP(drip, (err, udp) => {
							this.sources.push(udp);
							//this.links.udpSink.push('udp://' + (options.udpSink.host || Broadcast.host) + ':' + udp.port);
							drop();
						});
					}, () => {
						next();
					});
				} else {
					next();
				}
			},
			(next) => {
				if(options.udpStream) {
					var drain = _.isArray(options.udpStream) ? options.udpStream : [options.udpStream];
					async.forEach(drain, (run, dry) => {
						this.udpStream = new Broadcast.Stream.UDP(_.defaults(run, { channel: channel, port: Broadcast.channelPort++,  stream: this.stream, autoPlay: true}), (err, udp) => {
							this.links.udpStream.push('udp://' + (run.host || Broadcast.host) + ':' + udp.port);
							dry();
						});
					}, () => {
						next();
					});
				} else {
					next();
				}
			},
			(next) => {
				if(options.hls) {
					var share = _.isArray(options.hls) ? options.hls : [options.hls];
					async.forEach(share, (consume, finish) => {
						 var run = (cb) => {
							this.hls = new Broadcast.Stream.HLS(consume, (err, Source) => {
								if(err) {
									debug('##ERROR##',err);
								} else {
									this.links.hls.push(Source.link);
								}
								if(cb) cb();
							});
						}
						consume.crash = () => {
							run();
						};
						run(finish);				
						
					}, () => {
						next();
					});
				} else {
					next();
				}
			},
		], (err, all) => {
			this.play();
		});
	}
	
	
	/**
	 * Add a source
	 * 
	 * @api public
	 * 
	 * */

	Channel.prototype.setState = function(state, callback) {	
		
		//this.debug(this.channel + ' - ' +'set State', this.state);
		
		if(!_.isFunction(callback)) {
			callback = function(){}
		}
		if(_.isString(state)) {
			state = {
				current: state
			}
		}
		
		if(!state.current) {
			callback('current key required for object');
			return false;
		}	
		
		state.prev = this.state.current;
		
		this.state = state;
		callback(null, this.state);
		return this.state;		
	}
	
	/**
	 * Add a source
	 * 
	 * @api public
	 * 
	 * */

	Channel.prototype.addSource = function(name, file, callback) {	
		
		this.debug(this.channel + ' - ' +'Add Source to Channel', name, file);
		
		var asset = {
			file: file,
			name: name
		}
		this.sources.push(asset);
		this._loop.push(asset);
		
		if(!_.isFunction(callback)) {
			return this;
		} else {
			return callback();
		}
		
	}
	Channel.prototype.push = Channel.prototype.addSource;
	
	/**
	 * Remove a source or stream asset
	 * 
	 * @api public
	 * 
	 * */

	Channel.prototype.removeSource = function(name, callback) {
		_.pullAllBy(this.sources, [{ name: name }], 'name');
		_.pullAllBy(this._loop, [{ name: name }], 'name');
	}
	Channel.prototype.pull = Channel.prototype.removeSource;
	/**
	 * Get a source asset
	 * 
	 * @api public
	 * 
	 * */

	Channel.prototype.getSource = function(name, callback) {
		
		var asset = _.find(this.sources, { name: name });
		
		if(!_.isFunction(callback)) {
			return asset;
		} else {
			return callback(null, asset);
		}
		
	}
	Channel.prototype.source = Channel.prototype.getSource;
	
	/**
	 * Actioners
	 * 
	 * */

	Channel.prototype.throttle = function(source, rate, onEnd) {
		this.debug('Start Throttle for ' + source.name);
		var trottle = Broadcast.Stream.broadcast(source, rate, onEnd).pipe(this.stream, { end: false});
	}
	 
	// crash
	Channel.prototype.crash = function(Asset, forced) {
		this.currentSource = false;
		this.setState('Crashed');
	}
	
	// Stop
	Channel.prototype.stop = function(callback) {
		this.debug(this.channel + ' - ' +'run stop');
		this.setState('Stop');
		if(_.isFunction(this.currentSource.end)) {
			this.currentSource.end();
		}
	}
	
	// nextSource
	Channel.prototype.nextSource = function() {
		
		this.setState({
			current: 'Next Source',
		});
		
		this.debug(this.channel + ' - ' +'run nextSource');
		//this.currentSource = false;
		
		if(this.hls1) {
			this.debug(this.hls.segmentFile);
			if(this.hls.segmentFile) {
				fs.appendFile(this.hls.segmentFile, "\n#EXT-X-DISCONTINUITY", (err) => {
					if(err) this.debug('ERROR', err);
					this.debug('wrote block');
				});
			}
		}
		
		// play the next file after a transition
		if(this.transition || this.noTransition) {
			this.sources.shift();
			this.transition = false;
			this.play();
		} else {
			this.transition = true;
			var file = _.clone(this.filler);
			file.name = 'Transition with ' + this.filler.name
			this.play(file);
		}
	}
	
	// Play
	Channel.prototype.play = function(playThis, callback) {
		
		this.setState('Play');
				
		var source = playThis || this.sources[0];
		
		if(!source) {
			if(this.loop) {
				this.sources = this._loop.map(r => r);
				return this.play();
			} else {
				source = this.filler;
			}
		}
		
		source.channel = this.channel;
		if(!source.noDebug) {
			// respect channel debug
			source.noDebug = this.options.noDebug;
		}
		// push the next source on end
		source.end = this.nextSource.bind(this);
		
		// we can accept a ready stream
		if(Broadcast.isReadableStream(source.stream)) {
			this.debug(this.channel + '  -  ' +' Playing stream for ' + source.name);
			this.currentSource = source;
			
			// alert the channel update
			Broadcast.lodge.emit('channels', Broadcast.socketListeners.channels());
			
			// pipe the stream to our broadcast
			source.stream.pipe(this.broadcast);
			
			source.stream.on('end', () => {
				this.nextSource();
			});
			// throttle takes care of pushing our stream to broadcast
			//this.throttle(source, source.bitRate / 8, this.nextSource.bind(this));
			return;
		}
		
		if(!source.file) {
			console.log('No File or Stream found. Moving to next in queue... ', this.channel);
			return this.nextSource();
		}
		
		// create the source stream from a File
		this.currentSource = new Broadcast.Source.Fluent(source, (err, source) => {
			if(err) {
				this.debug(this.channel + ' - ' +'File failed to deliver a usable stream. Moving to next n queue...');
				return this.nextSource.call(this);
			}
			if(!Broadcast.isReadableStream(source.stream)) {
				this.debug(this.channel + ' - ' +'File failed to deliver a usable stream. Moving to next n queue...');
				return this.nextSource.call(this);
			}
			if(callback) {
				callback();
			}
			this.debug(this.channel + ' - ' +'Playing ' + source.name);
			
			// alert the channel update
			Broadcast.lodge.emit('channels', Broadcast.socketListeners.channels());
			
			source.stream.pipe(this.broadcast);
			
			// throttle takes care of pushing our stream to broadcast
			//this.throttle(source, source.bitRate / 8, this.nextSource.bind(this));

		});
		
		
	}
	Channel.prototype.start = Channel.prototype.play;
	
	// Pause
	Channel.prototype.pause = function(callback) {
		this.setState('Pause');
	}
	
	// Force a source now
	Channel.prototype.force = function(source, keep = false) {
		this.setState({
			current: 'Forcing Source',
			source: source,
		});
		this.debug(this.channel + ' - ' +'Try and Force  source ' + source.name);
		var play = () => {
			if(keep) {
				this.sources.unshift({dummy: true});
			}
			
			this.play(source, () => {
				this.debug(this.channel + ' - ' +'playing new source ' + source.name);
				if(_.isFunction(this.file.end)) {
					return this.file.end();
				}
			});
		}
		
		play();
		
	}

	return Channel;
}