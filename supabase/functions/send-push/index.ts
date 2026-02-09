// Supabase Edge Function to send push notifications
// Deploy with: supabase functions deploy send-push

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webPush from 'npm:web-push@3.6.7'

// VAPID keys - the private key is stored as a secret
const VAPID_PUBLIC_KEY = 'BNpgKg9wfuDbc34OdTPlQzDNlQ5ntKrQMIJ85tKIuPt1lFpg4LgNgpG6wJGRiukWirRBKZ1vv1UerQlHFSWoiUA';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') || '';
const VAPID_SUBJECT = 'mailto:admin@dishduty.app';

// Set up VAPID details globally
try {
    if (VAPID_PRIVATE_KEY) {
        webPush.setVapidDetails(
            VAPID_SUBJECT,
            VAPID_PUBLIC_KEY,
            VAPID_PRIVATE_KEY
        );
        console.log('VAPID details set successfully');
    } else {
        console.error('VAPID_PRIVATE_KEY is missing!');
    }
} catch (err) {
    console.error('Failed to set VAPID details:', err);
}

async function sendPushNotification(subscription: any, payload: any) {
    try {
        await webPush.sendNotification(
            {
                endpoint: subscription.endpoint,
                keys: {
                    p256dh: subscription.p256dh,
                    auth: subscription.auth
                }
            },
            JSON.stringify(payload)
        );
        return { success: true };
    } catch (error) {
        console.error('Push failed for sub:', subscription.endpoint.slice(0, 20), error);
        return { success: false, error: error.message };
    }
}

// CORS headers for all responses
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { household_id, person_name, exclude_person_index } = await req.json();

        // Create Supabase client
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        if (!supabaseUrl || !supabaseKey) {
            console.error('Missing Supabase environment variables', { supabaseUrl, supabaseKeyPresent: !!supabaseKey });
            throw new Error('Server misconfiguration: Missing Supabase environment variables');
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // Get all push subscriptions for this household (except the person who completed)
        const { data: subscriptions, error } = await supabase
            .from('push_subscriptions')
            .select('*')
            .eq('household_id', household_id)
            .neq('person_index', exclude_person_index);

        if (error) {
            throw error;
        }

        if (!subscriptions || subscriptions.length === 0) {
            return new Response(
                JSON.stringify({ message: 'No subscriptions found' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Send push to each subscriber
        const payload = {
            title: '🎉 Dishes Done!',
            body: `${person_name} finished washing the dishes!`,
            icon: '/icons/icon-192.svg'
        };

        const results = await Promise.all(
            subscriptions.map(sub => sendPushNotification(sub, payload))
        );

        return new Response(
            JSON.stringify({
                message: `Sent ${results.filter(r => r.success).length} notifications`,
                results
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        );
    }
});
