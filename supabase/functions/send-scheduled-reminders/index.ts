// Supabase Edge Function to send scheduled gamified notifications
// Triggered by external cron at 9 AM and 9 PM EAT (UTC+3)
// Deploy with: supabase functions deploy send-scheduled-reminders

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webPush from 'npm:web-push@3.6.7'

const VAPID_PUBLIC_KEY = 'BNpgKg9wfuDbc34OdTPlQzDNlQ5ntKrQMIJ85tKIuPt1lFpg4LgNgpG6wJGRiukWirRBKZ1vv1UerQlHFSWoiUA';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') || '';
const VAPID_SUBJECT = 'mailto:admin@dishduty.app';

try {
    if (VAPID_PRIVATE_KEY) {
        webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    }
} catch (err) {
    console.error('Failed to set VAPID:', err);
}

// ==================== Message Banks ====================
const MORNING_MESSAGES = [
    { title: '👑 Rise and shine king!', body: "It's your dish duty day — let's get it done!" },
    { title: '🍽️ Good morning!', body: 'The dishes have been waiting for you. Make us proud.' },
    { title: '💪 Time to earn your keep!', body: "Today it's your turn. You've got this." },
    { title: '☀️ Wakey wakey!', body: "It's dish day. The sooner you start, the sooner you're free." },
    { title: "🎯 You're up today!", body: "Show the boys how it's done. Dish duty awaits." }
];

const EVENING_ROASTS = [
    { title: '💅 Buttercup...', body: "Are you tired? What color dress do you wear?" },
    { title: '🫠 Oi mate', body: "Get off your a** — the dishes aren't washing themselves" },
    { title: '🦥 12 whole hours...', body: "Even a sloth would've finished by now. Come on {name}." },
    { title: '👀 The boys are watching', body: "The dishes are judging. Get moving." },
    { title: '👵 Your grandma called', body: "She would've finished these dishes AND made dinner by now." },
    { title: '🤲 Need help?', body: "Are the dishes scaring you? Do you need someone to hold your hand?" },
    { title: '🧙 Legend says...', body: "He's still staring at the dirty dishes... waiting for them to wash themselves" },
    { title: '📱 Group chat update', body: "At this rate we're renaming it to 'Dirty Dish {name}'" },
    { title: '👸 Plot twist', body: "The dishes aren't going to disappear, princess" },
    { title: '🎭 Classic {name}', body: "Day's almost over and you've done... absolutely nothing." },
    { title: '📰 Breaking news', body: "Local man discovers dishes don't clean themselves" },
    { title: '😤 Final warning', body: "You're one unwashed plate away from being kicked out of the group" },
    { title: '😭 The kitchen is crying', body: "Literally crying. Do something about it." },
    { title: '🧽 Missing persons report', body: "The dish sponge filed one on you. Show up." },
    { title: '🏋️ Fun fact', body: "Doing dishes burns calories. You clearly need this workout, {name}." }
];

function getRandomMessage(messages: any[], name: string, type: string) {
    const msg = messages[Math.floor(Math.random() * messages.length)];
    return {
        title: msg.title.replace(/\{name\}/g, name),
        body: msg.body.replace(/\{name\}/g, name),
        icon: '/icons/icon-192.svg',
        tag: `dish-duty-${type}`
    };
}

// ==================== Duty Calculation (mirrors client-side logic) ====================
function getTodayString(timezone = 'Africa/Nairobi') {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
    return formatter.format(now); // YYYY-MM-DD
}

function getDaysDiff(date1: string, date2: string) {
    const d1 = new Date(date1 + 'T00:00:00');
    const d2 = new Date(date2 + 'T00:00:00');
    return Math.floor((d2.getTime() - d1.getTime()) / (24 * 60 * 60 * 1000));
}

function getTodaysDutyIndex(startDate: string, startIndex: number, friendsCount: number) {
    const today = getTodayString();
    const daysSinceStart = getDaysDiff(startDate, today);
    const currentIndex = ((daysSinceStart % friendsCount) + friendsCount) % friendsCount;
    return (startIndex + currentIndex) % friendsCount;
}

// ==================== Push Helper ====================
async function sendPush(subscription: any, payload: any) {
    try {
        await webPush.sendNotification(
            { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
            JSON.stringify(payload)
        );
        return { success: true };
    } catch (error) {
        console.error('Push failed:', subscription.endpoint?.slice(0, 30), error.message);
        return { success: false, error: error.message };
    }
}

// ==================== CORS ====================
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ==================== Main Handler ====================
serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { type } = await req.json(); // "morning" or "evening"

        if (!type || !['morning', 'evening'].includes(type)) {
            throw new Error('Invalid type. Must be "morning" or "evening".');
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Missing Supabase env vars');
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // Get all households
        const { data: households, error: hError } = await supabase
            .from('households')
            .select('*');

        if (hError || !households) {
            throw new Error('Failed to fetch households: ' + hError?.message);
        }

        const todayStr = getTodayString();
        let totalSent = 0;

        for (const household of households) {
            const { friends, start_date, start_index, id: householdId } = household;
            if (!friends || friends.length === 0) continue;

            // Determine who's on duty today
            const dutyIndex = getTodaysDutyIndex(start_date, start_index, friends.length);
            const dutyName = friends[dutyIndex];

            if (type === 'evening') {
                // Check if today's task is already done — skip if completed
                const { data: completion } = await supabase
                    .from('completions')
                    .select('id')
                    .eq('household_id', householdId)
                    .eq('completed_date', todayStr)
                    .maybeSingle();

                if (completion) {
                    console.log(`Household ${householdId}: Already completed, skipping roast`);
                    continue;
                }
            }

            // Get push subscriptions for the duty person only
            const { data: subscriptions } = await supabase
                .from('push_subscriptions')
                .select('*')
                .eq('household_id', householdId)
                .eq('person_index', dutyIndex);

            if (!subscriptions || subscriptions.length === 0) {
                console.log(`Household ${householdId}: No subscriptions for ${dutyName}`);
                continue;
            }

            // Pick a message
            const messages = type === 'morning' ? MORNING_MESSAGES : EVENING_ROASTS;
            const payload = getRandomMessage(messages, dutyName, type);

            // Send to all devices of the duty person
            const results = await Promise.all(
                subscriptions.map(sub => sendPush(sub, payload))
            );

            const sent = results.filter(r => r.success).length;
            totalSent += sent;
            console.log(`Household ${householdId}: Sent ${sent} ${type} notifications to ${dutyName}`);
        }

        return new Response(
            JSON.stringify({ message: `Sent ${totalSent} ${type} notifications`, type }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
