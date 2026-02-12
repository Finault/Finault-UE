/**
 * FINAULT SLACK BOT
 * Meet Users Where They Are
 *
 * Jobs' philosophy: Don't make users come to you.
 * Bring the experience to them.
 *
 * The Slack bot brings Finault into the conversation:
 * - Ask questions in natural language
 * - Get alerts where teams already communicate
 * - Quick actions without leaving Slack
 */

import { App, ExpressReceiver } from '@slack/bolt';
import { createFinault } from '../ecosystem/finault-ecosystem.js';

// Initialize Slack app
const receiver = new ExpressReceiver({
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    endpoints: '/slack/events'
});

const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    receiver
});

// Cache for Finault instances per workspace
const finaultInstances = new Map();

/**
 * Get or create Finault instance for a workspace
 */
async function getFinault(teamId, userId) {
    const key = `${teamId}:${userId}`;

    if (!finaultInstances.has(key)) {
        const finault = createFinault({
            organizationId: teamId,
            userId: userId
        });
        await finault.initialize();
        finaultInstances.set(key, finault);
    }

    return finaultInstances.get(key);
}

/**
 * MENTION: @Finault in any channel
 */
app.event('app_mention', async ({ event, say }) => {
    const finault = await getFinault(event.team, event.user);

    // Extract the question (remove the mention)
    const question = event.text.replace(/<@[^>]+>/g, '').trim();

    if (!question) {
        await say({
            text: "Hi! I'm Finault, your AI cost governance assistant. Ask me anything about your AI spending!",
            thread_ts: event.ts
        });
        return;
    }

    // Show typing indicator
    await say({
        text: "🤔 Analyzing...",
        thread_ts: event.ts
    });

    // Get response from Finault
    const response = await finault.ask(question);

    await say({
        text: response.message,
        thread_ts: event.ts
    });
});

/**
 * DM: Direct message to Finault
 */
app.event('message', async ({ event, say }) => {
    // Only respond to DMs
    if (event.channel_type !== 'im') return;
    if (event.bot_id) return; // Ignore bot messages

    const finault = await getFinault(event.team, event.user);
    const response = await finault.ask(event.text);

    await say(response.message);
});

/**
 * SLASH COMMAND: /finault
 */
app.command('/finault', async ({ command, ack, respond }) => {
    await ack();

    const finault = await getFinault(command.team_id, command.user_id);
    const args = command.text.split(' ');
    const action = args[0]?.toLowerCase();

    switch (action) {
        case 'status':
            const status = await finault.quickAction('analyze', { days: 7 });
            await respond({
                blocks: [
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: `*📊 AI Cost Status (Last 7 Days)*\n\n${status.summary}`
                        }
                    }
                ]
            });
            break;

        case 'savings':
            const savings = await finault.quickAction('find_savings');
            const savingsText = savings.opportunities?.slice(0, 3).map(o =>
                `• ${o.description} - *$${o.monthly_savings.toFixed(0)}/mo*`
            ).join('\n') || 'No savings opportunities found';

            await respond({
                blocks: [
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: `*💰 Top Savings Opportunities*\n\n${savingsText}\n\nTotal: *$${savings.total_potential_savings?.toFixed(0) || 0}/month*`
                        }
                    },
                    {
                        type: 'actions',
                        elements: [
                            {
                                type: 'button',
                                text: { type: 'plain_text', text: 'Apply All' },
                                action_id: 'apply_all_savings',
                                style: 'primary'
                            },
                            {
                                type: 'button',
                                text: { type: 'plain_text', text: 'View Details' },
                                action_id: 'view_savings_details'
                            }
                        ]
                    }
                ]
            });
            break;

        case 'forecast':
            const forecast = await finault.quickAction('forecast', { months_ahead: 3 });
            const forecastText = forecast.forecasts?.map(f =>
                `• ${f.month_name}: *$${f.projected_cost.toFixed(0)}* (${f.vs_current})`
            ).join('\n') || 'Unable to generate forecast';

            await respond({
                blocks: [
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: `*🔮 3-Month Forecast*\n\nCurrent: $${forecast.current_monthly_spend?.toFixed(0)}/mo\n\n${forecastText}`
                        }
                    }
                ]
            });
            break;

        case 'autopilot':
            const subaction = args[1]?.toLowerCase();
            if (subaction === 'on') {
                const mode = args[2]?.toUpperCase() || 'ASSIST';
                const result = await finault.enableAutopilot(mode);
                await respond(`🤖 ${result.message}`);
            } else if (subaction === 'off') {
                const result = await finault.disableAutopilot();
                await respond(`🤖 ${result.message}`);
            } else {
                const status = finault.getAutopilotStatus();
                await respond(`🤖 Autopilot: ${status.enabled ? `ON (${status.mode})` : 'OFF'}`);
            }
            break;

        case 'help':
        default:
            await respond({
                blocks: [
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: `*🤖 Finault Commands*

\`/finault status\` - Quick spending overview
\`/finault savings\` - Find optimization opportunities
\`/finault forecast\` - See cost projections
\`/finault autopilot [on|off] [mode]\` - Control autopilot
\`/finault help\` - Show this message

*Or just ask me anything:*
\`/finault why did costs spike last week?\`
\`/finault what's my biggest cost driver?\`
\`/finault compare my costs to benchmarks\``
                        }
                    }
                ]
            });
    }
});

/**
 * BUTTON ACTION: Apply all savings
 */
app.action('apply_all_savings', async ({ body, ack, respond }) => {
    await ack();

    const finault = await getFinault(body.team.id, body.user.id);
    const result = await finault.quickAction('optimize', { auto_apply: true });

    await respond({
        text: `✅ Applied ${result.applied} optimizations. Estimated savings: $${result.total_savings?.toFixed(0)}/month`,
        replace_original: false
    });
});

/**
 * PROACTIVE ALERTS
 * Push important notifications to Slack
 */
export async function sendAlert(teamId, channelId, alert) {
    const emoji = {
        critical: '🚨',
        warning: '⚠️',
        info: 'ℹ️',
        success: '✅'
    }[alert.severity] || '📢';

    await app.client.chat.postMessage({
        channel: channelId,
        blocks: [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `${emoji} *${alert.title}*\n\n${alert.message}`
                }
            },
            ...(alert.action ? [{
                type: 'actions',
                elements: [
                    {
                        type: 'button',
                        text: { type: 'plain_text', text: alert.action.label },
                        action_id: alert.action.id,
                        style: alert.action.style || 'primary'
                    }
                ]
            }] : [])
        ]
    });
}

/**
 * DAILY SUMMARY
 * Post daily cost summary to a channel
 */
export async function sendDailySummary(teamId, channelId) {
    const finault = await getFinault(teamId, 'system');

    const [status, autopilotSummary] = await Promise.all([
        finault.quickAction('analyze', { days: 1 }),
        finault.components.autopilot?.generateDailySummary()
    ]);

    await app.client.chat.postMessage({
        channel: channelId,
        blocks: [
            {
                type: 'header',
                text: { type: 'plain_text', text: '📊 Daily AI Cost Summary' }
            },
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*Yesterday's Spending*\n${status.summary || 'No data available'}`
                }
            },
            ...(autopilotSummary ? [{
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*🤖 Autopilot Actions*\nActions taken: ${autopilotSummary.actions_taken}\nEstimated savings: $${autopilotSummary.estimated_savings?.toFixed(0) || 0}`
                }
            }] : []),
            {
                type: 'divider'
            },
            {
                type: 'context',
                elements: [
                    { type: 'mrkdwn', text: 'Reply to this message or use `/finault` for more details' }
                ]
            }
        ]
    });
}

/**
 * HOME TAB
 * Personalized dashboard in Slack
 */
app.event('app_home_opened', async ({ event, client }) => {
    const finault = await getFinault(event.view.team_id, event.user);

    const status = await finault.status();
    const savings = await finault.quickAction('find_savings');

    await client.views.publish({
        user_id: event.user,
        view: {
            type: 'home',
            blocks: [
                {
                    type: 'header',
                    text: { type: 'plain_text', text: '🚀 Finault AI Cost Governance' }
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `*Welcome to Finault!*\n\nI help you understand and optimize your AI spending.`
                    }
                },
                {
                    type: 'divider'
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `*🤖 Autopilot Status*\n${status.components?.autopilot?.running ? `ON (${status.components.autopilot.mode})` : 'OFF'}`
                    },
                    accessory: {
                        type: 'button',
                        text: { type: 'plain_text', text: status.components?.autopilot?.running ? 'Disable' : 'Enable' },
                        action_id: status.components?.autopilot?.running ? 'disable_autopilot' : 'enable_autopilot'
                    }
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `*💰 Potential Savings*\n$${savings.total_potential_savings?.toFixed(0) || 0}/month available`
                    },
                    accessory: {
                        type: 'button',
                        text: { type: 'plain_text', text: 'View Savings' },
                        action_id: 'view_savings'
                    }
                },
                {
                    type: 'divider'
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: '*Quick Actions*'
                    }
                },
                {
                    type: 'actions',
                    elements: [
                        {
                            type: 'button',
                            text: { type: 'plain_text', text: '📊 Cost Report' },
                            action_id: 'generate_report'
                        },
                        {
                            type: 'button',
                            text: { type: 'plain_text', text: '🔮 Forecast' },
                            action_id: 'view_forecast'
                        },
                        {
                            type: 'button',
                            text: { type: 'plain_text', text: '⚠️ Anomalies' },
                            action_id: 'view_anomalies'
                        }
                    ]
                }
            ]
        }
    });
});

// Export the app
export { app, receiver };
export default app;
