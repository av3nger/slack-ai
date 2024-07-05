import { SlackApp, SlackAppEnv } from "slack-cloudflare-workers";
const { Configuration, OpenAIApi } = require("openai");

const configuration = new Configuration({
	apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

/**
 * Send a request to the OpenAI API.
 *
 * @param {array}  thread    Message thread, contains an array of messages.
 * @param {string} botUserId The bot ID.
 *
 * @return {Promise<*>}
 */
const sendAiRequest = async (thread, botUserId) => {
	// Remove the mention from event.text
	const mentionPattern = new RegExp(`<@${botUserId}>`, 'g');

	const messages = thread.map(message => {
		const role = message.user === botUserId ? "assistant" : "user";
		return { role, content: message.text.replace(mentionPattern, '').trim() };
	});
	messages.unshift({role: "system", content: "You are a Slack bot. Make sure to format your messages using mrkdwn syntax."})

	const completion = await openai.createChatCompletion({
		model: "gpt-3.5-turbo",
		messages: messages,
	});

	return completion.data.choices[0].message.content;
};

export default {
	async fetch(
		request: Request,
		env: SlackAppEnv,
		ctx: ExecutionContext
	): Promise<Response> {
		const app = new SlackApp({ env })
			.event("app_mention", async ({ event, context, say }) => {
				const messages = [{ user: event.user, text: event.text }];
				const response = await sendAiRequest(messages, context.botUserId);

				// Send the reply
				await say({
					channel: event.channel,
					thread_ts: event.ts, // Respond in the same thread
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
