const { App } = require("@slack/bolt");
const { Configuration, OpenAIApi } = require("openai");

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

(async () => {
  await app.start();
  console.log('⚡️ Bolt app started');
})();

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

/**
 * Subscribe to 'app_mention' event in your App config
 * Requires app_mentions:read and chat:write scopes
 */
app.event('app_mention', async ({ event, context, client, say }) => {
  try {
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
  }
  catch (error) {
    console.error(error);
  }
});

/**
 * Listen to messages in a thread
 */
app.event('message', async ({ event, context, say }) => {
  // Check if the event is a message in a channel, is a thread reply, and is not sent by the bot itself
  if (event.channel_type !== 'channel' || ! event.thread_ts || event.user === context.botUserId) {
    return;
  }

  try {
    const thread = await app.client.conversations.replies({
      channel: event.channel,
      ts: event.thread_ts,
    });

    const response = await sendAiRequest(thread.messages, context.botUserId);

    await say({
      channel: event.channel,
      thread_ts: event.thread_ts,
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
  }
  catch (error) {
    console.error(error);
  }
});
