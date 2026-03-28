import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const botToken = searchParams.get('token') || process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken || botToken === 'your_telegram_bot_token_here') {
    return NextResponse.json({
      error: 'Telegram Bot Token not provided.',
      help: [
        '1. Open Telegram and search for @BotFather',
        '2. Send /newbot command',
        '3. Follow instructions to create your bot',
        '4. Copy the bot token and paste it below',
        '5. Send some messages to your bot first!',
      ],
    }, { status: 400 });
  }

  try {
    // Get recent messages sent to the bot
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/getUpdates?limit=50`,
      { cache: 'no-store' }
    );

    if (!res.ok) throw new Error(`Telegram API error: ${res.status}`);

    const data = await res.json();

    if (!data.ok) throw new Error(data.description || 'Telegram API failed');

    const messages = (data.result || [])
      .filter(update => update.message?.text)
      .map(update => ({
        id: update.update_id,
        from: update.message.from?.first_name
          ? `${update.message.from.first_name}${update.message.from.last_name ? ' ' + update.message.from.last_name : ''}`
          : update.message.from?.username || 'Unknown',
        username: update.message.from?.username || '',
        text: update.message.text,
        date: new Date(update.message.date * 1000).toISOString(),
        chat: update.message.chat?.title || update.message.chat?.first_name || 'Private Chat',
      }))
      .reverse(); // Most recent first

    return NextResponse.json({ success: true, messages });
  } catch (err) {
    console.error('Telegram fetch error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
