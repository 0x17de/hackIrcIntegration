var libircd = require("libircd.js");
var libhack = require("libhack.js");
var util = require("util");

var hackHostname = 'wss://hack.chat/chat-ws';
var hackUsername = null; // set by irc client
var ircUserguid = null; // set by irc client

var hackByChannelName = {};
var hackChannelValidator = new RegExp("^[a-z]+$", "i");

function FakeIrcHackUser(nick) {
	libircd.Client.call(this);
	this.nick = nick;
}
util.inherits(FakeIrcHackUser, libircd.Client);
FakeIrcHackUser.prototype.getRemoteAddress = function() {
	return 'hack.chat';
}
FakeIrcHackUser.prototype.write = function(data) {
	// Nothing will happen here
}

var server = new libircd.IrcServer('wealllikedebian');
server.on('message', function(json) {
	var hackClient = hackByChannelName[json.channel];
	if (!hackClient) return;
	hackClient.sendMessage(json.message);
});
server.on('connect', function(json) {
	hackUsername = json.nick;
	ircUserguid = json.guid;
});
server.on('roomchange', function(roomJson) {
	var hackChannel = roomJson.channel;
	if (!hackChannel || (typeof hackChannel) != 'string') return;
	hackChannel = hackChannel.substr(1);
	if (!hackChannelValidator.test(hackChannel)) return;

	var fakeClientsByChannel = {};
	function getOrCreateFakeClient(channelName, nick) {
		var channel = fakeClientsByChannel[channelName];
		if (!channel) fakeClientsByChannel[channelName] = channel = {};
		var client = channel[nick];
		if (client)
			return client;
		else
			channel[nick] = client = new FakeIrcHackUser(nick);
		if (!channel['']) channel[''] = 0;
		channel[''] += 1;
		server.addClient(client);
		server.clientJoinsChannel(client, roomJson.channel);
		return client;
	}

	var hackClient;
	if (roomJson.bJoin) {
		hackClient = hackByChannelName[roomJson.channel] = new libhack.Client(hackHostname, hackChannel, hackUsername);

		hackClient.on('message', function(json) {
			var channel = server.channels[roomJson.channel];
			if (!channel) return;
			if (json.nick == hackUsername) return;
			json.message.split("\n").forEach(function(line) {
				channel.deliverMessage(getOrCreateFakeClient(roomJson.channel, json.nick), line);
			});
		});
		hackClient.on('begin', function() {
			roomJson.joinFunction();
		});
		// @TODO: userchange event
		hackClient.on('userlist', function(json) {
			console.log(JSON.stringify(json));
			for (var i = 0; i < json.nicks.length; ++i) {
				if (json.nicks[i] == hackUsername) continue;
				getOrCreateFakeClient(roomJson.channel, json.nicks[i]);
			}
		});
		hackClient.on('end', function() {
			server.kick(server.clientsByGuid[ircUserguid], roomJson.channel);
		});

		hackClient.connect();
	} else {
		hackClient = hackByChannelName[roomJson.channel];
		if (hackClient) {
			hackClient.disconnect();
			delete hackByChannelName[roomJson.channel];
		}
		// Cleanup room?
		var channel = server.channels[roomJson.channel];
		if (channel) {
			var clients = fakeClientsByChannel[roomJson.channel];
			if (clients && channel.clientCount - clients.channel[''] == 0) {
				var clients = fakeClientsByChannel[roomJson.channel];
				for (var i in clients) {
					if (i == '') continue;
					server.kick(clients[i], channel);
					if (clients[i].channelCount == 0)
						server.killClient(clients[i]);
					delete clients[i];
				}
			}
		}
	}
});

server.start('0.0.0.0', 6667);

