PulseApp.factory('yammerMessage', function ($rootScope, $sce, yammerService, processingQueue) {
	var yammerMessage = {
		imageExtensions: [".jpg", ".bmp", ".gif", ".png", ".jpeg", ".jpe", ".jfif", ".tiff", ".tif", ".tga", ".dds", ".ico", ".svg"],
		youtubeUrlIdetifier: "www.youtube",
		youtubeVideoIdParam: "v",
		youtubeEmbedUrl: "http://www.youtube.com/embed/{0}?autoplay=1",
		getMessageQueue: {}
	};

	yammerMessage.getUserById = function (userId, references) {
		var user = FirstOrDefault(yammerService.users, function (u) { return u.Id == userId; });
		if (!user) {
			var userReference = FirstOrDefault(references, function(e) { return e.id == userId; });
			if (userReference)
				user = yammerMessage.createUser(userReference);
			else {
				user = { Id: userId };
				yammerService.getUser(userId, function(result) {
					var newUser = yammerMessage.createUser(result);
					user.Name = newUser.Name;
					user.PictureUrl = newUser.PictureUrl;
					user.ProfileUrl = newUser.ProfileUrl;
					$rootScope.$apply();
				});
			}
			yammerService.users.push(user);
		}
		return user;
	};

	yammerMessage.createUser = function(user) {
		return { Id: user.id, Name: user.full_name, PictureUrl: user.mugshot_url, ProfileUrl: user.web_url };
	};

	yammerMessage.getGroupById = function(groupId, references) {
		var groupReference = FirstOrDefault(references, function (e) { return e.id == groupId; });
		var group = !groupReference ? yammerService.allCompanyGroup : { Id: groupReference.id, Name: groupReference.full_name, PictureUrl: groupReference.mugshot_url, ProfileUrl: groupReference.web_url };

		if (!FirstOrDefault(yammerService.groups, function(g) { return g.Id == group.Id; }))
			yammerService.groups.push(group);
		return group;
	};

	yammerMessage.showMore = function (message, success) {
		message.IsRepliesLoading = true;
		yammerService.showMore(message.ThreadId, message.oldestReply.MessageId, function (result) {
			var messages = [];
			$.each(result.messages, function (index, msg) {
				if (msg.replied_to_id)
					messages.push(msg);
			});
			yammerMessage.addReplies(message, messages, false, result.references, result.meta);
			message.IsRepliesLoading = false;
			message.CanShowLess = true;
			success();
		});
	};
	yammerMessage.showLess = function (message, success) {
		message.IsRepliesLoading = true;
		yammerService.showLess(message.ThreadId, function (result) {
			message.newestReply = message.oldestReply = null;
			message.Replies.length = 0;
			var messages = null;
			$.each(result.threaded_extended, function (index, m) {
				if (parseInt(index) == message.ThreadId)
					messages = m;
			});
			yammerMessage.addReplies(message, messages, false, result.references, result.meta);
			message.IsRepliesLoading = false;
			message.CanShowLess = false;
			success();
		});
	};

	yammerMessage.createLinkImageOrModule = function (value, meta) {
		var item;
		var module = value.ymodule && meta && meta.ymodules ? FirstOrDefault(meta.ymodules, function (y) { return y.id == value.id; }) : null;
		if (module) {
			item = { type: 'module', Id: module.id, HtmlContent: module.inline_html };
		} else {
			var isImage = FirstOrDefault(yammerMessage.imageExtensions, function (e) { return StringEndsWith(value.web_url.toLowerCase(), e); }) != null;
			item = {
				Id: value.id,
				Title: value.name ? value.name : value.web_url,
				Description: value.description ? value.description.split("\n").join(" ") : '',
				Link: value.web_url,
				HostUrl: value.host_url,
				PictureUrl: value.preview_url ? value.preview_url : (value.thumbnail_url ? value.thumbnail_url : (value.image ? value.image : (isImage ? value.web_url : null))),
				EmbeddedUrl: value.web_url.indexOf(yammerMessage.youtubeUrlIdetifier) >= 0 ? yammerMessage.youtubeEmbedUrl.replace("{0}", GetParameterByName(value.web_url, yammerMessage.youtubeVideoIdParam)) : '',
			};

			if (value.large_preview_url != null || value.web_url != null && isImage)
				item.type = 'image';
			else
				item.type = 'link';
		}
		return item;
	};

	yammerMessage.create = function(message, references, meta) {
		var messageReference = FirstOrDefault(references, function(e) { return e.id == message.id && e.stats; });
		var tags = [];
		if (messageReference && messageReference.topics) {
			$.each(messageReference.topics, function(index, value) {
				var topic = FirstOrDefault(references, function(e) { return e.id == value.id; });
				tags.push({ Id: topic.id, Title: topic.name, Link: topic.web_url });
			});
		}
		var notifiedUsers = [];
		if (message.notified_user_ids) {
			$.each(message.notified_user_ids, function(index, value) {
				notifiedUsers.push(yammerMessage.getUserById(value, references));
			});
		}
		var isLikedByCurrentUser = meta.liked_message_ids && $.inArray(message.id, meta.liked_message_ids) >= 0;
		var likedByUsers = [];
		if (message.liked_by) {
			$.each(message.liked_by.names, function(index, value) {
				if (value.user_id != meta.current_user_id)
					likedByUsers.push(yammerMessage.getUserById(value.user_id, references));
			});
		}
		var links = [], images = [], modules = [];
		if (message.attachments) {
			$.each(message.attachments, function (index, value) {
				var item = yammerMessage.createLinkImageOrModule(value, meta);
				switch (item.type) {
					case 'module':
						modules.push(item);
						break;
					case 'image':
						images.push(item);
						break;
					default:
						links.push(item);
						break;
				}
			});
		}
		var unreadMessageCount = 0;
		var markedAsNew = false;
		if (!message.replied_to_id && meta.unseen_message_count_by_thread) {
			unreadMessageCount = meta.unseen_message_count_by_thread[message.thread_id];
			if (message.id > meta.last_seen_message_id) {
				markedAsNew = true;
				unreadMessageCount--;
			}
		}
		return {
			MessageId: message.id,
			ThreadId: message.thread_id,
			AuthorId: message.sender_id,
			Author: yammerMessage.getUserById(message.sender_id, references),
			Group: yammerMessage.getGroupById(message.group_id, references),
			PubDate: Date.parse(message.created_at),
			HtmlContent: message.body ? message.body.rich : '',
			IsRootMessage: !message.replied_to_id,
			IsLikedByCurrentUser: isLikedByCurrentUser,
			Tags: tags,
			NotifiedUsers: notifiedUsers,
			LikedByNum: message.liked_by.count - (isLikedByCurrentUser ? 1 : 0),
			LikedByUsers: likedByUsers,
			NumberOfHiddenReplies: 0,
			Replies: [],
			Links: links,
			Images: images,
			Modules: modules,
			RepliedToMessageId: message.replied_to_id,
			NumberOfNewReplies: 0,
			IsCurrentUserFollowing: meta.threads_in_inbox ? $.inArray(message.id, meta.threads_in_inbox) >= 0 : false,
			Link: message.web_url,
			UnreadMessageCount: unreadMessageCount,
			LastSeenMessageId: meta.last_seen_message_id,
			MarkedAsNew: markedAsNew,
		};
	};

	yammerMessage.addReplies = function(rootMessage, messages, markAsNew, references, meta) {
		var replies = [];
		var originalNumReplies = yammerMessage.getTotalNumberOfReplies(rootMessage.Replies);

		$.each(messages, function(index, reply) {
			var existingReply = yammerMessage.findReply(reply.id, rootMessage.Replies);
			if (!existingReply) {
				var r = yammerMessage.create(reply, references, meta);
				yammerMessage.markAsNewIfNeeded(rootMessage, r, markAsNew);
				yammerMessage.setNewestAndOldestReplyIfNeeded(rootMessage, r);
				replies.push(r);
			}
			else if (markAsNew)
				existingReply.MarkedAsNew = true;
		});

		var rootReplies = [];
		$.each(replies, function(index, reply) { rootReplies.push(reply); });
		$.merge(rootReplies, rootMessage.Replies);

		for (var i = replies.length - 1; i >= 0; i--) {
			if (replies[i].RepliedToMessageId != rootMessage.ThreadId) {
				var reply = replies[i];
				replies.splice(i, 1);
				var parent = yammerMessage.appendReplyToParent(rootMessage, reply, rootReplies, markAsNew, references, meta);
				if (parent != null) {
					replies.splice(i, 0, parent);
					rootReplies.push(parent);
				}
			}
		}
		if (replies.length > 0) {
			if (rootMessage.Replies.length <= 0 || rootMessage.Replies[rootMessage.Replies.length - 1].PubDate < replies[0].PubDate) {
				for (var j = replies.length - 1; j >= 0; j--) {
					if (replies[j]) rootMessage.Replies.push(replies[j]);
				}
			} else {
				$.each(replies, function (index, reply) {
					if (reply) rootMessage.Replies.splice(0, 0, reply);
				});
			}
		}

		for (var k = rootMessage.Replies.length - 1; k >= 0; k--) {
			var reply = rootMessage.Replies[k];
			if (reply.RepliedToMessageId != rootMessage.ThreadId) {
				var parent = yammerMessage.findReply(reply.RepliedToMessageId, rootMessage.Replies);
				if (parent) {
					rootMessage.Replies.splice(k, 1);
					parent.Replies.push(reply);
				}
			}
		}
		
		var messageReference = FirstOrDefault(references, function (e) { return e.id == rootMessage.MessageId && e.stats; });
		var numReplies = yammerMessage.getTotalNumberOfReplies(rootMessage.Replies);
		if (messageReference)
			rootMessage.NumberOfHiddenReplies = messageReference.stats && messageReference.stats.updates > numReplies ? messageReference.stats.updates - numReplies - 1 : 0;
		else if (numReplies - originalNumReplies <= rootMessage.NumberOfHiddenReplies)
			rootMessage.NumberOfHiddenReplies -= numReplies - originalNumReplies;
		else
			rootMessage.NumberOfHiddenReplies = 0;
		rootMessage.CanShowMore = rootMessage.NumberOfHiddenReplies > 0;

		return replies;
	};
	
	yammerMessage.markAsNewIfNeeded = function (rootMessage, message, markAsNew) {
		var unread = rootMessage.UnreadMessageCount > 0 && message.MessageId > rootMessage.LastSeenMessageId;
		message.MarkedAsNew = unread || markAsNew;
		if (unread)
			rootMessage.UnreadMessageCount--;
	};

	yammerMessage.appendReplyToParent = function (rootMessage, message, rootReplies, markAsNew, references, meta) {
		var parentToAdd = null;
		var parent = yammerMessage.findReplyParent(message, rootReplies);
		if( parent == null )
		{
			var messageReference = FirstOrDefault(references, function (e) { return e.id == message.RepliedToMessageId; });
			parentToAdd = { MessageId: messageReference.id, ThreadId: messageReference.thread_id, PubDate: Date.parse(messageReference.created_at), AuthorId: messageReference.sender_id, Replies: [] };
			parentToAdd.Replies.push(message);
			yammerMessage.markAsNewIfNeeded(rootMessage, parentToAdd, markAsNew);

			processingQueue.addItem(yammerMessage.getMessageQueue, { message: message, isNew: parentToAdd.MarkedAsNew, references: references, meta: meta, parentToAdd: parentToAdd, rootMessage: rootMessage });
			processingQueue.startQueueIfNeeded(yammerMessage.getMessageQueue, yammerMessage.updateMessage);
		}
		else {
			if (!FirstOrDefault(parent.Replies, function(r) { return r.MessageId == message.MessageId; }))
				parent.Replies.push(message);
		}
		return parentToAdd;
	};
	yammerMessage.updateMessage = function(data) {
		yammerService.getMessage(data.message.RepliedToMessageId, function (result) {
			var m = yammerMessage.create(result, data.references, data.meta);
			m.MarkedAsNew = data.isNew;
			$.merge(m.Replies, data.parentToAdd.Replies);
			data.rootMessage.Replies.splice($.inArray(data.parentToAdd, data.rootMessage.Replies), 1, m);
			$rootScope.$apply();
			processingQueue.queueItemFinishedProcessing(yammerMessage.getMessageQueue, yammerMessage.updateMessage);
		});
	};

	yammerMessage.findReplyParent = function(message, replies) {
		var parent = FirstOrDefault(replies, function (r) { return r.MessageId == message.RepliedToMessageId; });
		if (!parent) {
			$.each(replies, function (index, reply) {
				if (!parent)
					parent = yammerMessage.findReplyParent(message, reply.Replies);
			});
		}
		return parent;
	};

	yammerMessage.getTotalNumberOfReplies = function (replies) {
		var result = replies.length;
		$.each(replies, function (index, reply) {
			result += yammerMessage.getTotalNumberOfReplies(reply.Replies);
		});
		return result;
	};

	yammerMessage.findReply = function(replyId, replies) {
		var result = null;
		$.each(replies, function (index, value) {
			if (!result)
				result = value.MessageId == replyId ? value : yammerMessage.findReply(replyId, value.Replies);
		});
		return result;
	};

	yammerMessage.setNewestAndOldestReplyIfNeeded = function (rootMessage, reply) {
		if (reply) {
			if (!rootMessage.newestReply || reply.PubDate > rootMessage.newestReply.PubDate)
				rootMessage.newestReply = reply;
			if (!rootMessage.oldestReply || reply.PubDate < rootMessage.oldestReply.PubDate)
				rootMessage.oldestReply = reply;
		}
	};

	return yammerMessage;
});