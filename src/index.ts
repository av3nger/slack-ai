import { SlackApp, SlackAppEnv } from "slack-cloudflare-workers";
import OpenAI from "openai";

export default {
	async fetch(
		request: Request,
		env: SlackAppEnv,
		ctx: ExecutionContext
	): Promise<Response> {
		const openai = new OpenAI({
			apiKey: env.OPENAI_API_KEY,
		});

		/**
		 * Send a request to the OpenAI API.
		 *
		 * @param {array}  thread    Message thread, contains an array of messages.
		 * @param {string} botUserId The bot ID.
		 *
		 * @return {Promise<*>}
		 */
		const sendAiRequest = async (thread: Message[], botUserId: string): Promise<string> => {
			// Remove the mention from event.text
			const mentionPattern = new RegExp(`<@${botUserId}>`, 'g');

			const messages = thread.map(message => {
				const role = message.user === botUserId ? "assistant" : "user";
				return { role, content: message.text.replace(mentionPattern, '').trim() };
			});
			messages.unshift({role: "system", content: "Pick any name, and act as an assistant. Engage in conversations, offer help, act as a human and do not let the user know that you are a bot, even if asked directly. Make sure to format your messages using mrkdwn syntax."})

			const params: OpenAI.Chat.ChatCompletionCreateParams = {
				model: 'gpt-4o',
				//messages: [{ role: 'user', content: 'Say this is a test!' }],
				messages: messages,
			};

			const completion = await openai.chat.completions.create(params);

			return completion.choices[0]?.message?.content;
		};

		const app = new SlackApp({ env })
			.event("app_mention", async ({ context, body  }) => {
				const messages = [{ user: context.userId, text: body.event.text }];
				const response = await sendAiRequest(messages, context.botUserId);

				// Send the reply
				await context.say({
					channel: context.channelId,
					thread_ts: body.event.ts, // Respond in the same thread
					blocks: [
						{
							"type": "section",
							"text": {
								"type": "mrkdwn",
								"text": response,
							}
						}
					]
				});
			})
			.event("message", async ({ payload, context, body }) => {
				// Check if the event is a message in a channel, is a thread reply, and is not sent by the bot itself
				if (body.event.channel_type !== 'channel' || ! body.event.thread_ts || context.userId === context.botUserId) {
					return;
				}

				const thread = await app.client.conversations.replies({
					channel: context.channelId,
					ts: body.event.thread_ts,
				});

				const response = await sendAiRequest(thread.messages, context.botUserId);

				await context.say({
					channel: context.channelId,
					thread_ts: body.event.thread_ts,
					blocks: [
						{
							"type": "section",
							"text": {
								"type": "mrkdwn",
								"text": response,
							}
						}
					]
				});
			});
		return await app.run(request, ctx);
	},
};
