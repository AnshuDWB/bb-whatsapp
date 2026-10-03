import { NextResponse } from 'next/server'
import { parseAppSecrets } from '@/lib/whatsapp/webhook-signature'

/**
 * GET /api/whatsapp/webhook/debug
 *
 * Diagnostic endpoint – shows whether the critical env vars for
 * inbound webhook processing are present and well-formed.
 *
 * ⚠️  Never exposes actual secret values – only presence / length.
 * Safe to hit from a browser during setup; remove or gate behind
 * auth before going to production with real traffic.
 */
export async function GET() {
  const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN
  const appSecretRaw = process.env.META_APP_SECRET
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  const appSecrets = parseAppSecrets(appSecretRaw)

  // Verify whether the primary META_APP_SECRET is valid with Meta's Graph API
  // Using the known App ID 1114097997637630
  let appSecretStatus = 'Not checked'
  if (appSecrets.length > 0) {
    try {
      const testToken = `1114097997637630|${appSecrets[0]}`
      const metaRes = await fetch(`https://graph.facebook.com/v21.0/app?access_token=${testToken}`)
      if (metaRes.ok) {
        const metaData = await metaRes.json()
        appSecretStatus = `✅ VALID — Meta recognized App: "${metaData.name || metaData.id}"`
      } else {
        const errData = await metaRes.json().catch(() => ({}))
        appSecretStatus = `❌ INVALID APP SECRET (${metaRes.status}) — Meta error: ${errData?.error?.message || 'Invalid signature'}. All inbound webhooks will be rejected with 401 until this is corrected!`
      }
    } catch (e) {
      appSecretStatus = `⚠️ Could not verify with Meta: ${e instanceof Error ? e.message : String(e)}`
    }
  }

  const checks = {
    timestamp: new Date().toISOString(),
    webhook_url: '/api/whatsapp/webhook',
    meta_app_id: '1114097997637630',
    meta_app_secret_status: appSecretStatus,
    environment: {
      WEBHOOK_VERIFY_TOKEN: verifyToken
        ? `✅ Set (${verifyToken.length} chars)`
        : '❌ MISSING — Meta verification will fail',
      META_APP_SECRET: appSecrets.length > 0
        ? `Set (${appSecrets.length} secret(s), length: ${appSecrets[0].length})`
        : '❌ MISSING — ALL inbound POSTs will be rejected with 401',
      SKIP_WEBHOOK_SIGNATURE_VERIFY: process.env.SKIP_WEBHOOK_SIGNATURE_VERIFY === 'true'
        ? '⚠️ ENABLED (signature verification is bypassed)'
        : 'disabled (normal secure mode)',
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl
        ? `✅ Set`
        : '❌ MISSING — DB lookups will crash',
      SUPABASE_SERVICE_ROLE_KEY: serviceKey
        ? `✅ Set (${serviceKey.length} chars)`
        : '❌ MISSING — DB lookups will crash',
    },
    action_required_if_invalid_secret: [
      '1. Open https://developers.facebook.com/apps/',
      '2. Select your app: bachat bazar (App ID: 1114097997637630)',
      '3. In left sidebar: App settings -> Basic',
      '4. Find "App Secret", click "Show", enter password and copy it',
      '5. Update META_APP_SECRET in Render Environment Variables AND in .env.local',
      '6. Redeploy Render service',
    ],
    meta_dashboard_checklist: [
      '1. Go to Meta Developer Dashboard → Your App → WhatsApp → Configuration',
      '2. Callback URL must be: https://<your-domain>/api/whatsapp/webhook',
      '3. Verify Token must match your WEBHOOK_VERIFY_TOKEN exactly',
      '4. Click "Verify and Save" — must return 200',
      '5. Under "Webhook Fields", subscribe to: messages (CRITICAL!)',
      '6. Also subscribe to: message_template_status_update (for template status)',
      '7. App Secret (App Settings → Basic) must match META_APP_SECRET',
    ],
    common_issues: [
      '❗ "messages" field not subscribed — #1 reason for no inbound',
      '❗ META_APP_SECRET wrong — webhook POST returns 401 (check server logs)',
      '❗ Render/Vercel deployment not updated — old code still running',
      '❗ WhatsApp phone number not linked to the app in Meta dashboard',
      '❗ Test message sent from same number as business — WhatsApp blocks self-messages',
    ],
  }

  return NextResponse.json(checks, { status: 200 })
}
