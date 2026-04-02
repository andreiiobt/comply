import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { InviteEmail } from '../_shared/email-templates/invite.tsx'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

const SITE_NAME = 'COMPLY'
const ROOT_DOMAIN = 'comply.iobt.com.au'
const FROM_DOMAIN = 'appemail.iobt.com.au'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  if (!resendApiKey) {
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Auth — caller must be a logged-in admin
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  const supabaseAdmin = createClient(supabaseUrl, serviceKey)

  const supabaseUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: { user }, error: userErr } = await supabaseUser.auth.getUser()
  if (userErr || !user) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const { data: isAdmin } = await supabaseAdmin.rpc('has_role', {
    _user_id: user.id,
    _role: 'admin',
  })
  if (!isAdmin) {
    return new Response(
      JSON.stringify({ error: 'Admin role required' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  let body: { inviteCode: string; email: string }
  try {
    body = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const { inviteCode, email } = body

  if (!inviteCode || !email) {
    return new Response(
      JSON.stringify({ error: 'inviteCode and email are required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Validate the invite exists, is pending, and belongs to the caller's company
  const { data: callerProfile } = await supabaseAdmin
    .from('profiles')
    .select('company_id')
    .eq('user_id', user.id)
    .single()

  const { data: invite, error: inviteErr } = await supabaseAdmin
    .from('invitations')
    .select('id, company_id, email, invite_code, status')
    .eq('invite_code', inviteCode)
    .eq('status', 'pending')
    .single()

  if (inviteErr || !invite) {
    return new Response(
      JSON.stringify({ error: 'Invitation not found or already used' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (invite.company_id !== callerProfile?.company_id) {
    return new Response(
      JSON.stringify({ error: 'Forbidden' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Generate a Supabase magic auth link so the user is logged in the moment they
  // click — no separate email-verification step needed.
  const redirectTo = `https://${ROOT_DOMAIN}/invite/${inviteCode}`

  let inviteUrl = redirectTo // fallback if generateLink fails

  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo },
  })

  if (!linkError && linkData?.properties?.action_link) {
    inviteUrl = linkData.properties.action_link
  } else {
    // User may already exist — fall back to a magic link for existing accounts
    const { data: mlData } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo },
    })
    if (mlData?.properties?.action_link) {
      inviteUrl = mlData.properties.action_link
    }
  }

  const html = await renderAsync(
    React.createElement(InviteEmail, {
      siteName: SITE_NAME,
      siteUrl: `https://${ROOT_DOMAIN}`,
      confirmationUrl: inviteUrl,
    })
  )

  const messageId = crypto.randomUUID()

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
      to: [email],
      subject: `You've been invited to join ${SITE_NAME}`,
      html,
    }),
  })

  if (!res.ok) {
    const errBody = await res.text()
    console.error(`Resend API error [${res.status}]: ${errBody}`)
    supabaseAdmin.from('email_send_log').insert({
      message_id: messageId,
      template_name: 'invite',
      recipient_email: email,
      status: 'failed',
      error_message: `Resend error ${res.status}: ${errBody}`,
    })
    return new Response(
      JSON.stringify({ error: 'Failed to send invite email' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  supabaseAdmin.from('email_send_log').insert({
    message_id: messageId,
    template_name: 'invite',
    recipient_email: email,
    status: 'sent',
  })

  console.log('Invite email sent', { email, inviteCode })

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
