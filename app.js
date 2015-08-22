var libircd = require("libircd.js");
var libhack = require("libhack.js");
var util = require("util");

var hackHostname = 'wss://hack.chat/chat-ws';
var hackUsername = 'testnick_xyzzy';

var hackByChannelName = {};
var hackChannelValidator = new RegExp("^[a-z]+$", "i");

function FakeIrcHackUser(nick) {
	this.nick = nick;
}
util.inherits(FakeIrcHackUser, libircd.Client);
FakeIrcHackUser.prototype.getRemoteAddress = function() {
	return 'hack.chat';
}
FakeIrcHackUser.prototype.write = function(data) {
	// Nothing happens
}

var server = new libircd.IrcServer('wealllikedebian');
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
		if (!client) channel[nick] = client = new FakeIrcHackUser(nick);
		if (client) return client;
		if (!channel['']) channel[''] = 0;
		channel[''] += 1;
		server.addClient(client);
		return client;
	}

	var hackClient;
	if (roomJson.bJoin) {
		hackClient = hackByChannelName[roomJson.channel] = new libhack.Client(hackHostname, hackChannel, hackUsername);
		hackClient.on('message', function(json) {
			var channel = server.channels[roomJson.channel];
			if (!channel) return;
			channel.deliverMessage(getOrCreateFakeClient(roomJson.channelName, json.nick), json.message);
		});
		hackClient.on('begin', function() {
			roomJson.joinFunction();
		});
		// @TODO: userchange event
		hackClient.on('userlist', function(json) {
			for (var i = 0; i < json.nicks.length; ++i) {
				getOrCreateFakeClient(roomJson.channelName, json.nicks[i]);
			}
		});
		hackClient.on('end', function() {
			server.kick(server.clientsByGuid[json.guid], roomJson.channel);
		});
		hackClient.connect();
	} else {
		hackClient = hackByChannelName[roomJson.channel];
		if (hackClient) {
			hackClient.disconnect();
			delete hackByChannelName[roomJson.channel];
		}
		var channel = server.channels[roomJson.channel];
		if (channel) {
			if (channel.clientCount - fakeClientsByChannel[roomJson.channel][''] == 0) {
				var clients = fakeClientsByChannel[roomJson.channel];
				for (var i in clients) {
					if (i == '') continue;
					server.kick(clients[i], channel);
				}
			}
		}
	}
});

server.start('0.0.0.0', 6667);

